const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { getRequiredModelFiles } = require("../../src/helpers/parakeetModelInfo");

const MODEL_NAME = "parakeet-tdt-0.6b-v3";

function createFloat32Wav(sampleValue, sampleCount = 160) {
  const dataSize = sampleCount * 4;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(3, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(64000, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(32, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    wav.writeFloatLE(sampleValue, 44 + index * 4);
  }

  return wav;
}

function createPcm16Wav(sampleValue, sampleCount = 160) {
  const dataSize = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    wav.writeInt16LE(Math.round(sampleValue * 32767), 44 + index * 2);
  }

  return wav;
}

test("transcribes audible mono 16 kHz float32 WAV input", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "openwhispr-parakeet-wav-test-"));
  // On Windows modelDirUtils prefers %USERPROFILE% over the stubbed home and
  // would migrate these empty fixture files into the developer's real cache,
  // where the app then treats them as an installed model. Pin the cache root.
  const originalCacheRoot = process.env.OPENWHISPR_CACHE_ROOT;
  process.env.OPENWHISPR_CACHE_ROOT = path.join(tempHome, ".cache", "neato-echo");
  const originalLoad = Module._load;
  let ffmpegUtils;
  Module._load = function loadWithElectronStub(request, parent, isMain) {
    if (request === "electron") {
      return {
        app: {
          getPath: () => tempHome,
          isReady: () => false,
        },
      };
    }
    if (request === "./ffmpegUtils" && parent?.filename.endsWith("parakeetServer.js")) {
      return {
        ...ffmpegUtils,
        getFFmpegPath: () => "/mock/ffmpeg",
        convertToWav: async (_inputPath, outputPath) => {
          fs.writeFileSync(outputPath, createPcm16Wav(0.5));
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  let ParakeetServerManager;
  try {
    ffmpegUtils = require("../../src/helpers/ffmpegUtils");
    ParakeetServerManager = require("../../src/helpers/parakeetServer");
  } finally {
    Module._load = originalLoad;
  }

  try {
    const modelDir = path.join(tempHome, ".cache", "neato-echo", "parakeet-models", MODEL_NAME);
    fs.mkdirSync(modelDir, { recursive: true });
    for (const file of getRequiredModelFiles(MODEL_NAME)) {
      // Non-empty: isModelDownloaded treats zero-byte files as a failed install.
      fs.writeFileSync(path.join(modelDir, file), "fixture");
    }

    let receivedSamples;
    const manager = new ParakeetServerManager();
    manager.wsServer = {
      start: async () => {},
      transcribe: async (samples) => {
        receivedSamples = Buffer.from(samples);
        return { text: "audible", elapsed: 0 };
      },
    };

    const result = await manager.transcribe(createFloat32Wav(0.5), { modelName: MODEL_NAME });

    assert.equal(result.text, "audible");
    assert.ok(receivedSamples);
    assert.ok(Math.abs(receivedSamples.readFloatLE(0) - 0.5) < 0.001);
  } finally {
    if (originalCacheRoot === undefined) delete process.env.OPENWHISPR_CACHE_ROOT;
    else process.env.OPENWHISPR_CACHE_ROOT = originalCacheRoot;
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});
