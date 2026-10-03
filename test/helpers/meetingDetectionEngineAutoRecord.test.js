const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { EventEmitter } = require("node:events");

// Stub electron so requiring the engine (and its externalUrlOpener/windowBroadcast
// deps) does not pull in the real runtime.
const originalLoad = Module._load;
Module._load = function loadWithElectronStub(request, parent, isMain) {
  if (request === "electron") {
    return {
      shell: { openExternal: async () => undefined },
      BrowserWindow: { getAllWindows: () => [] },
      app: {
        isPackaged: false,
        isReady: () => false,
        getPath: () => require("node:os").tmpdir(),
        getVersion: () => "0.0.0",
        getAppPath: () => process.cwd(),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const MeetingDetectionEngine = require("../../src/helpers/meetingDetectionEngine");
Module._load = originalLoad;

class FakeAudioActivityDetector extends EventEmitter {
  constructor() {
    super();
    this.running = false;
  }
  async start() {
    this.running = true;
  }
  stop() {
    this.running = false;
  }
  getExternalMicState() {
    return { reliable: true, externalMicActive: false };
  }
  setUserRecording() {}
  resetPrompt() {}
  dismiss() {}
}

class FakeMeetingProcessDetector extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.detected = [];
  }
  start() {
    this.running = true;
  }
  stop() {
    this.running = false;
  }
  getDetectedProcesses() {
    return this.detected.map((processKey) => ({ processKey, appName: processKey }));
  }
}

function createEngine({ autoRecordMeetings = true } = {}) {
  const audioActivityDetector = new FakeAudioActivityDetector();
  const meetingProcessDetector = new FakeMeetingProcessDetector();
  const shownNotifications = [];
  const savedNotes = [];
  const navigations = [];
  let nextNoteId = 100;

  const windowManager = {
    notificationPrefs: {},
    showMeetingNotification: (n) => {
      shownNotifications.push(n);
      return true;
    },
    dismissMeetingNotification: () => {},
    queueMeetingNoteNavigation: async (payload) => {
      navigations.push(payload);
    },
  };

  const databaseManager = {
    saveNote: (title, _body, type) => {
      const note = { id: nextNoteId++, title, note_type: type };
      savedNotes.push(note);
      return { note };
    },
    getMeetingsFolder: () => ({ id: "meetings-folder" }),
    getCalendarEventById: () => null,
    getNoteByCalendarEventId: () => null,
    updateNote: () => ({ success: false }),
  };

  const engine = new MeetingDetectionEngine(
    { getActiveMeetingState: () => ({ activeMeeting: null, upcomingEvents: [] }) },
    meetingProcessDetector,
    audioActivityDetector,
    windowManager,
    databaseManager
  );
  engine.setPreferences({ autoRecordMeetings });

  return { engine, meetingProcessDetector, shownNotifications, savedNotes, navigations };
}

const meetEvent = () => ({
  id: "cal-1",
  calendar_id: "primary",
  summary: "Standup",
  start_time: new Date().toISOString(),
  hangout_link: "https://meet.google.com/abc-defg-hij",
});

// --- _autoRecordQualifies ---

test("audio qualifies only when a known meeting app is running", () => {
  const { engine, meetingProcessDetector } = createEngine();

  meetingProcessDetector.detected = [];
  assert.equal(engine._autoRecordQualifies("audio", {}), false);

  meetingProcessDetector.detected = ["chrome"]; // browser mic use — not a meeting app
  assert.equal(engine._autoRecordQualifies("audio", {}), false);

  meetingProcessDetector.detected = ["zoom"];
  assert.equal(engine._autoRecordQualifies("audio", {}), true);

  meetingProcessDetector.detected = ["teams"];
  assert.equal(engine._autoRecordQualifies("audio", {}), true);

  meetingProcessDetector.detected = ["webex"];
  assert.equal(engine._autoRecordQualifies("audio", {}), true);
});

test("calendar qualifies only when the event carries a meeting link", () => {
  const { engine } = createEngine();
  assert.equal(engine._autoRecordQualifies("calendar", { event: meetEvent() }), true);
  assert.equal(
    engine._autoRecordQualifies("calendar", {
      event: { id: "x", calendar_id: "primary", summary: "No link", hangout_link: null },
    }),
    false
  );
});

// --- routing ---

test("mic in a meeting app auto-starts a recording instead of prompting", async () => {
  const { engine, meetingProcessDetector, shownNotifications, savedNotes } = createEngine({
    autoRecordMeetings: true,
  });
  meetingProcessDetector.detected = ["zoom"];

  engine._handleDetection("audio", "sustained-audio", {});
  await new Promise((r) => setImmediate(r));

  assert.equal(shownNotifications.length, 0, "no prompt should be shown");
  assert.equal(savedNotes.length, 1, "a meeting note should be created");
  assert.equal(savedNotes[0].note_type, "meeting");
  engine.stop();
});

test("mic with no meeting app running falls through to the prompt", async () => {
  const { engine, meetingProcessDetector, shownNotifications, savedNotes } = createEngine({
    autoRecordMeetings: true,
  });
  meetingProcessDetector.detected = []; // YouTube / Siri / mic test

  engine._handleDetection("audio", "sustained-audio", {});
  await new Promise((r) => setImmediate(r));

  assert.equal(savedNotes.length, 0, "must not auto-start");
  assert.equal(shownNotifications.length, 1, "should prompt as before");
  engine.stop();
});

test("with auto-record off, a meeting app on mic still only prompts", async () => {
  const { engine, meetingProcessDetector, shownNotifications, savedNotes } = createEngine({
    autoRecordMeetings: false,
  });
  meetingProcessDetector.detected = ["zoom"];

  engine._handleDetection("audio", "sustained-audio", {});
  await new Promise((r) => setImmediate(r));

  assert.equal(savedNotes.length, 0, "must not auto-start when the toggle is off");
  assert.equal(shownNotifications.length, 1);
  engine.stop();
});

test("a scheduled meeting-link calendar event auto-starts", async () => {
  const { engine, shownNotifications, savedNotes, navigations } = createEngine({
    autoRecordMeetings: true,
  });

  engine.handleCalendarReminder(meetEvent());
  await new Promise((r) => setImmediate(r));

  assert.equal(shownNotifications.length, 0);
  assert.equal(savedNotes.length, 1);
  assert.equal(navigations.length, 1);
  assert.equal(navigations[0].trigger, "auto-record");
  engine.stop();
});
