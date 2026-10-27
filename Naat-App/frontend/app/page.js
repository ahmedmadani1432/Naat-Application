'use client';

import { useEffect, useRef, useState } from 'react';

const presets = [
  {
    name: 'Studio + Mehfil Stereo',
    description: 'A clear lead with restrained stereo spread and spacious vocal-room depth. An original starting point, not a recreation of any specific mix.',
    settings: { reverb: 34, warmth: 56, clarity: 60, compression: 42, output: 80, stereoWidth: 48, delayMode: 'short', delayMix: 30, delayTimeMs: 380, delayFeedback: 42, delayTone: 62 },
  },
  {
    name: 'Hafiz Tahir Qadri Inspired',
    description: 'Warm vocal body, rich room depth, and smooth dynamics.',
    settings: { reverb: 28, warmth: 58, clarity: 54, compression: 42, output: 80, stereoWidth: 30, delayMode: 'long', delayMix: 28, delayTimeMs: 520, delayFeedback: 38, delayTone: 58 },
  },
  {
    name: 'Zohaib Ashrafi Inspired',
    description: 'Clear articulation and a bright, intimate vocal focus.',
    settings: { reverb: 16, warmth: 38, clarity: 72, compression: 35, output: 80, stereoWidth: 18, delayMode: 'short', delayMix: 24, delayTimeMs: 240, delayFeedback: 28, delayTone: 72 },
  },
  {
    name: 'Gulam Mustafa Qadri Inspired',
    description: 'Full presence, resonant tone, and firmer dynamic control.',
    settings: { reverb: 23, warmth: 68, clarity: 61, compression: 58, output: 78, stereoWidth: 35, delayMode: 'pingpong', delayMix: 32, delayTimeMs: 240, delayFeedback: 48, delayTone: 56 },
  },
  {
    name: 'Classical Studio',
    description: 'Balanced, natural vocal processing with subtle room depth.',
    settings: { reverb: 12, warmth: 48, clarity: 55, compression: 30, output: 80, stereoWidth: 22, delayMode: 'off', delayMix: 0, delayTimeMs: 320, delayFeedback: 36, delayTone: 68 },
  },
];

const backgroundRoles = [
  {
    id: 'harmony',
    label: 'Recorded harmony take',
    suggestion: 'Import a harmony vocal you have sung separately. For an automatically generated scale harmony, use the harmony generator below.',
    volume: 24,
    pan: 0,
  },
];

const initialSettings = { reverb: 18, warmth: 50, clarity: 55, compression: 35, output: 80, stereoWidth: 30, vocalGainDb: 0, noiseGate: false, noiseGateThresholdDb: -55, delayMode: 'off', delayMix: 30, delayTimeMs: 380, delayFeedback: 40, delayTone: 62 };
const retiredLayerRoles = new Set([
  'zikr',
  'zikr-loop',
  'zikr-arranger',
  'arrangement-intro',
  'auto-unison',
  'auto-phrase-end',
  'unison',
  'phrase-end',
]);
const PROJECT_AUDIO_DB = 'naat-studio-local-audio';
const PROJECT_AUDIO_STORE = 'projects';

function openProjectAudioStore() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(PROJECT_AUDIO_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PROJECT_AUDIO_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local project storage.'));
  });
}

async function readSavedProjectAudio() {
  const database = await openProjectAudioStore();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(PROJECT_AUDIO_STORE, 'readonly');
      const request = transaction.objectStore(PROJECT_AUDIO_STORE).get('current');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Could not read saved audio.'));
    });
  } finally {
    database.close();
  }
}

async function saveProjectAudio(projectAudio) {
  const database = await openProjectAudioStore();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(PROJECT_AUDIO_STORE, 'readwrite');
      transaction.objectStore(PROJECT_AUDIO_STORE).put(projectAudio, 'current');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Could not save project audio.'));
      transaction.onabort = () => reject(transaction.error || new Error('Saving project audio was aborted.'));
    });
  } finally {
    database.close();
  }
}

function makeImpulseResponse(context) {
  const duration = 2.4;
  const decay = 2.8;
  const impulse = context.createBuffer(2, context.sampleRate * duration, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const samples = impulse.getChannelData(channel);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = (Math.random() * 2 - 1) * ((1 - i / samples.length) ** decay);
    }
  }
  return impulse;
}

function applyNoiseGate(buffer, thresholdDb) {
  const threshold = 10 ** (thresholdDb / 20);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.max(1, Math.floor(sampleRate * 0.01));
  const holdFrames = Math.floor(sampleRate * 0.18);
  const attackCoefficient = Math.exp(-1 / (sampleRate * 0.01));
  const releaseCoefficient = Math.exp(-1 / (sampleRate * 0.22));
  const closedGain = 0.12;
  let envelope = 0.001;
  let holdRemaining = 0;
  let open = false;

  for (let start = 0; start < buffer.length; start += windowSize) {
    const end = Math.min(buffer.length, start + windowSize);
    let energy = 0;
    for (const channel of channels) {
      for (let frame = start; frame < end; frame += 1) energy += channel[frame] ** 2;
    }
    const rms = Math.sqrt(energy / ((end - start) * channels.length));
    if (rms >= threshold) {
      open = true;
      holdRemaining = holdFrames;
    } else if (holdRemaining > 0) {
      holdRemaining -= end - start;
    } else {
      open = false;
    }
    const target = open ? 1 : closedGain;
    const coefficient = target > envelope ? attackCoefficient : releaseCoefficient;
    for (let frame = start; frame < end; frame += 1) {
      envelope = target + coefficient * (envelope - target);
      for (const channel of channels) channel[frame] *= envelope;
    }
  }
  return buffer;
}

function configureAudioGraph(context, source, settings, destination = context.destination, track = {}, enabled = true, liveGate = false) {
  const warmth = context.createBiquadFilter();
  warmth.type = 'lowshelf';
  warmth.frequency.value = 180;
  warmth.gain.value = ((settings.warmth - 50) / 50) * 5;

  const clarity = context.createBiquadFilter();
  clarity.type = 'peaking';
  clarity.frequency.value = 3200;
  clarity.Q.value = 0.8;
  clarity.gain.value = ((settings.clarity - 50) / 50) * 5;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 18;
  compressor.ratio.value = 1 + settings.compression / 12;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.22;
  const vocalGain = context.createGain();
  vocalGain.gain.value = 10 ** (Math.min(settings.vocalGainDb, 12) / 20);
  const gate = liveGate ? context.createScriptProcessor(2048, 2, 2) : context.createGain();
  let gateEnabled = settings.noiseGate;
  let gateThreshold = 10 ** (settings.noiseGateThresholdDb / 20);
  let gateEnvelope = 0.12;
  let gateHold = 0;
  let gateOpen = false;
  if (liveGate) {
    gate.onaudioprocess = (event) => {
      const input = event.inputBuffer;
      const outputBuffer = event.outputBuffer;
      let energy = 0;
      let sampleCount = 0;
      for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
        const samples = input.getChannelData(channel);
        for (let frame = 0; frame < samples.length; frame += 1) {
          energy += samples[frame] ** 2;
          sampleCount += 1;
        }
      }
      const rms = Math.sqrt(energy / sampleCount);
      if (!gateEnabled || rms >= gateThreshold) {
        gateOpen = true;
        gateHold = Math.floor(context.sampleRate * 0.18);
      } else if (gateHold > 0) {
        gateHold -= input.length;
      } else {
        gateOpen = false;
      }
      const target = !gateEnabled || gateOpen ? 1 : 0.12;
      const coefficient = Math.exp(-1 / (context.sampleRate * (target > gateEnvelope ? 0.01 : 0.22)));
      for (let frame = 0; frame < outputBuffer.length; frame += 1) {
        gateEnvelope = target + coefficient * (gateEnvelope - target);
        for (let channel = 0; channel < outputBuffer.numberOfChannels; channel += 1) {
          const inputChannel = input.getChannelData(Math.min(channel, input.numberOfChannels - 1));
          const outputChannel = outputBuffer.getChannelData(channel);
          outputChannel[frame] = inputChannel[frame] * gateEnvelope;
        }
      }
    };
  }

  const dry = context.createGain();
  dry.gain.value = 1 - settings.reverb / 160;
  const convolver = context.createConvolver();
  convolver.buffer = makeImpulseResponse(context);
  const wet = context.createGain();
  wet.gain.value = settings.reverb / 100;
  const stereoDelayLeft = context.createDelay(0.05);
  const stereoDelayRight = context.createDelay(0.05);
  stereoDelayLeft.delayTime.value = 0.012;
  stereoDelayRight.delayTime.value = 0.018;
  const stereoWidthLeft = context.createGain();
  const stereoWidthRight = context.createGain();
  stereoWidthLeft.gain.value = (settings.stereoWidth / 100) * 0.1;
  stereoWidthRight.gain.value = (settings.stereoWidth / 100) * 0.1;
  const stereoPanLeft = context.createStereoPanner();
  const stereoPanRight = context.createStereoPanner();
  stereoPanLeft.pan.value = -1;
  stereoPanRight.pan.value = 1;
  const delayWet = context.createGain();
  const shortInput = context.createGain();
  const longInput = context.createGain();
  const shortDelay = context.createDelay(2.1);
  const longDelay = context.createDelay(2.1);
  const shortFeedback = context.createGain();
  const longFeedback = context.createGain();
  const shortTone = context.createBiquadFilter();
  const longTone = context.createBiquadFilter();
  const shortMode = context.createGain();
  const longMode = context.createGain();
  shortTone.type = 'lowpass';
  longTone.type = 'lowpass';
  shortTone.Q.value = 0.35;
  longTone.Q.value = 0.35;
  compressor.connect(shortInput);
  shortInput.connect(shortDelay);
  shortDelay.connect(shortMode);
  shortMode.connect(delayWet);
  shortDelay.connect(shortTone);
  shortTone.connect(shortFeedback);
  shortFeedback.connect(shortDelay);
  compressor.connect(longInput);
  longInput.connect(longDelay);
  longDelay.connect(longMode);
  longMode.connect(delayWet);
  longDelay.connect(longTone);
  longTone.connect(longFeedback);
  longFeedback.connect(longDelay);

  const leftDelay = context.createDelay(2.1);
  const rightDelay = context.createDelay(2.1);
  const leftFeedback = context.createGain();
  const rightFeedback = context.createGain();
  const leftFeedbackTone = context.createBiquadFilter();
  const rightFeedbackTone = context.createBiquadFilter();
  const leftPan = context.createStereoPanner();
  const rightPan = context.createStereoPanner();
  const pingPongLeftMode = context.createGain();
  const pingPongRightMode = context.createGain();
  const pingPongInput = context.createGain();
  leftFeedbackTone.type = 'lowpass';
  rightFeedbackTone.type = 'lowpass';
  leftFeedbackTone.Q.value = 0.35;
  rightFeedbackTone.Q.value = 0.35;
  leftPan.pan.value = -1;
  rightPan.pan.value = 1;
  compressor.connect(pingPongInput);
  pingPongInput.connect(leftDelay);
  leftDelay.connect(leftPan);
  rightDelay.connect(rightPan);
  leftPan.connect(pingPongLeftMode);
  rightPan.connect(pingPongRightMode);
  pingPongLeftMode.connect(delayWet);
  pingPongRightMode.connect(delayWet);
  leftDelay.connect(leftFeedbackTone);
  leftFeedbackTone.connect(rightFeedback);
  rightFeedback.connect(rightDelay);
  rightDelay.connect(rightFeedbackTone);
  rightFeedbackTone.connect(leftFeedback);
  leftFeedback.connect(leftDelay);
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  const output = context.createGain();
  output.gain.value = settings.output / 100;
  const bypass = context.createGain();
  const processed = context.createGain();
  bypass.gain.value = enabled ? 0 : 1;
  processed.gain.value = enabled ? 1 : 0;
  const trackGain = context.createGain();
  trackGain.gain.value = (track.volume ?? 100) / 100;
  const panner = context.createStereoPanner();
  panner.pan.value = (track.pan ?? 0) / 100;

  source.connect(bypass);
  bypass.connect(destination);
  source.connect(gate);
  gate.connect(warmth);
  warmth.connect(clarity);
  clarity.connect(vocalGain);
  vocalGain.connect(compressor);
  compressor.connect(dry);
  compressor.connect(convolver);
  compressor.connect(stereoDelayLeft);
  compressor.connect(stereoDelayRight);
  stereoDelayLeft.connect(stereoWidthLeft);
  stereoDelayRight.connect(stereoWidthRight);
  stereoWidthLeft.connect(stereoPanLeft);
  stereoWidthRight.connect(stereoPanRight);
  convolver.connect(wet);
  dry.connect(output);
  wet.connect(output);
  stereoPanLeft.connect(output);
  stereoPanRight.connect(output);
  delayWet.connect(output);
  output.connect(limiter);
  limiter.connect(trackGain);
  trackGain.connect(panner);
  panner.connect(processed);
  processed.connect(destination);

  const update = (nextSettings) => {
    const now = context.currentTime;
    const smooth = (param, value) => param.setTargetAtTime(value, now, 0.025);
    smooth(warmth.gain, ((nextSettings.warmth - 50) / 50) * 5);
    smooth(clarity.gain, ((nextSettings.clarity - 50) / 50) * 5);
    smooth(compressor.ratio, 1 + nextSettings.compression / 12);
    smooth(vocalGain.gain, 10 ** (Math.min(nextSettings.vocalGainDb, 12) / 20));
    smooth(dry.gain, 1 - nextSettings.reverb / 160);
    smooth(wet.gain, nextSettings.reverb / 100);
    smooth(stereoWidthLeft.gain, (nextSettings.stereoWidth / 100) * 0.1);
    smooth(stereoWidthRight.gain, (nextSettings.stereoWidth / 100) * 0.1);
    smooth(output.gain, nextSettings.output / 100);
    gateEnabled = nextSettings.noiseGate;
    gateThreshold = 10 ** (nextSettings.noiseGateThresholdDb / 20);
    smooth(delayWet.gain, nextSettings.delayMix / 100);
    smooth(shortDelay.delayTime, nextSettings.delayTimeMs / 1000);
    smooth(longDelay.delayTime, nextSettings.delayTimeMs / 1000);
    smooth(leftDelay.delayTime, nextSettings.delayTimeMs / 1000);
    smooth(rightDelay.delayTime, nextSettings.delayTimeMs / 1000);
    const feedbackGain = (nextSettings.delayFeedback / 100) * 0.86;
    smooth(shortFeedback.gain, feedbackGain);
    smooth(longFeedback.gain, feedbackGain);
    smooth(leftFeedback.gain, feedbackGain);
    smooth(rightFeedback.gain, feedbackGain);
    const toneFrequency = 900 + (nextSettings.delayTone / 100) * 11100;
    smooth(shortTone.frequency, toneFrequency);
    smooth(longTone.frequency, toneFrequency);
    smooth(leftFeedbackTone.frequency, toneFrequency);
    smooth(rightFeedbackTone.frequency, toneFrequency);
    smooth(shortInput.gain, nextSettings.delayMode === 'short' ? 1 : 0);
    smooth(longInput.gain, nextSettings.delayMode === 'long' ? 1 : 0);
    smooth(pingPongInput.gain, nextSettings.delayMode === 'pingpong' ? 1 : 0);
    smooth(shortMode.gain, nextSettings.delayMode === 'short' ? 1 : 0);
    smooth(longMode.gain, nextSettings.delayMode === 'long' ? 1 : 0);
    smooth(pingPongLeftMode.gain, nextSettings.delayMode === 'pingpong' ? 1 : 0);
    smooth(pingPongRightMode.gain, nextSettings.delayMode === 'pingpong' ? 1 : 0);
  };

  update(settings);

  return {
    warmth, clarity, compressor, dry, wet, output, update,
    setEnabled: (value) => {
      const now = context.currentTime;
      bypass.gain.setTargetAtTime(value ? 0 : 1, now, 0.015);
      processed.gain.setTargetAtTime(value ? 1 : 0, now, 0.015);
    },
  };
}

function encodeWav(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const frames = audioBuffer.length;
  const bytesPerSample = 2;
  const dataSize = frames * channels * bytesPerSample;
  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);
  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: channels }, (_, index) => audioBuffer.getChannelData(index));
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([wav], { type: 'audio/wav' });
}

const pitchClasses = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const scaleSteps = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const keyProfiles = {
  major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
};

function estimateLeadPitch(frame, sampleRate) {
  const frameMean = frame.reduce((total, sample) => total + sample, 0) / frame.length;
  const minLag = Math.floor(sampleRate / 700);
  const maxLag = Math.min(Math.ceil(sampleRate / 80), frame.length - 1);
  let bestLag = 0;
  let bestCorrelation = 0;
  let energy = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = 0; index < frame.length - lag; index += 1) {
      const left = frame[index] - frameMean;
      const right = frame[index + lag] - frameMean;
      correlation += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    energy = Math.max(energy, leftEnergy);
    const normalized = correlation / Math.sqrt(leftEnergy * rightEnergy || 1);
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestLag = lag;
    }
  }
  if (bestCorrelation < 0.58 || !bestLag || energy / frame.length < 0.00002) return null;

  const frequency = sampleRate / bestLag;
  return { midi: 69 + 12 * Math.log2(frequency / 440), confidence: bestCorrelation };
}

function detectMusicalKey(pitches) {
  const histogram = Array(12).fill(0);
  for (const pitch of pitches) {
    if (pitch) histogram[((Math.round(pitch.midi) % 12) + 12) % 12] += pitch.confidence;
  }
  const total = histogram.reduce((sum, value) => sum + value, 0);
  if (total < 8) {
    throw new Error('Not enough clearly sung notes to estimate the key. Try a longer, cleaner lead recording.');
  }

  const mean = histogram.reduce((sum, value) => sum + value, 0) / histogram.length;
  const centeredHistogram = histogram.map((value) => value - mean);
  const histogramEnergy = Math.sqrt(centeredHistogram.reduce((sum, value) => sum + value * value, 0));
  const matches = [];

  for (let keyIndex = 0; keyIndex < pitchClasses.length; keyIndex += 1) {
    for (const scale of ['major', 'minor']) {
      const profile = keyProfiles[scale].map((_, pitchClass) => keyProfiles[scale][(pitchClass - keyIndex + 12) % 12]);
      const profileMean = profile.reduce((sum, value) => sum + value, 0) / profile.length;
      const centeredProfile = profile.map((value) => value - profileMean);
      const profileEnergy = Math.sqrt(centeredProfile.reduce((sum, value) => sum + value * value, 0));
      const score = centeredHistogram.reduce((sum, value, index) => sum + value * centeredProfile[index], 0)
        / (histogramEnergy * profileEnergy || 1);
      matches.push({ key: pitchClasses[keyIndex], scale, score });
    }
  }
  matches.sort((left, right) => right.score - left.score);
  return { ...matches[0], margin: matches[0].score - matches[1].score };
}

function findHarmonyShift(pitch, keyIndex, scale, intervalSteps) {
  if (!pitch) return null;
  const midi = pitch.midi;
  const allowed = [];
  for (let note = Math.floor(midi) - 24; note <= Math.ceil(midi) + 12; note += 1) {
    if (scaleSteps[scale].includes(((note - keyIndex) % 12 + 12) % 12)) allowed.push(note);
  }
  let nearestIndex = 0;
  for (let index = 1; index < allowed.length; index += 1) {
    if (Math.abs(allowed[index] - midi) < Math.abs(allowed[nearestIndex] - midi)) nearestIndex = index;
  }
  const targetIndex = Math.max(0, Math.min(allowed.length - 1, nearestIndex + intervalSteps));
  const targetMidi = allowed[targetIndex];
  return targetMidi - midi;
}

async function generateScaleHarmonies(file, keyOverride, scaleOverride, intervals, onProgress) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('Audio processing is not supported in this browser.');
  const context = new AudioContextClass();
  try {
    const source = await context.decodeAudioData(await file.arrayBuffer());
    const sampleRate = source.sampleRate;
    const mono = new Float32Array(source.length);
    for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
      const channelData = source.getChannelData(channel);
      for (let frame = 0; frame < source.length; frame += 1) mono[frame] += channelData[frame] / source.numberOfChannels;
    }

    const decimation = 4;
    const analysisRate = sampleRate / decimation;
    const analysis = new Float32Array(Math.ceil(mono.length / decimation));
    for (let index = 0; index < analysis.length; index += 1) analysis[index] = mono[index * decimation] || 0;
    const analysisWindow = 1024;
    const analysisHop = 512;
    const grainSize = 2048;
    const grainHop = 512;
    const pitches = [];

    for (let start = 0; start < analysis.length; start += analysisHop) {
      const frame = analysis.subarray(start, Math.min(start + analysisWindow, analysis.length));
      if (frame.length < analysisWindow) break;
      pitches.push(estimateLeadPitch(frame, analysisRate));
      if (pitches.length % 48 === 0) {
        onProgress?.(`Analyzing sung notes… ${Math.min(35, Math.round((start / analysis.length) * 35))}%`);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    }

    const detectedKey = detectMusicalKey(pitches);
    const key = keyOverride === 'auto' ? detectedKey.key : keyOverride;
    const scale = scaleOverride === 'auto' ? detectedKey.scale : scaleOverride;
    const keyIndex = pitchClasses.indexOf(key);
    const harmonies = [];
    const halfGrain = Math.floor(grainSize / 2);

    for (let intervalIndex = 0; intervalIndex < intervals.length; intervalIndex += 1) {
      const interval = intervals[intervalIndex];
      const steps = interval.startsWith('fifth') ? 4 : 2;
      const direction = interval.endsWith('below') ? -1 : 1;
      const rawShifts = pitches.map((pitch) => findHarmonyShift(pitch, keyIndex, scale, steps * direction));
      const shiftFrames = rawShifts.map((shift, index) => {
        if (shift === null) return null;
        const nearby = rawShifts.slice(Math.max(0, index - 2), Math.min(rawShifts.length, index + 3))
          .filter((value) => value !== null)
          .sort((left, right) => left - right);
        return nearby[Math.floor(nearby.length / 2)];
      });
      const output = new Float32Array(mono.length);
      const weightSum = new Float32Array(mono.length);

      for (let center = 0, grainIndex = 0; center < mono.length; center += grainHop, grainIndex += 1) {
        const shift = shiftFrames[Math.min(
          shiftFrames.length - 1,
          Math.floor(center / decimation / analysisHop),
        )];
        if (shift === null || shift === undefined) continue;
        const ratio = 2 ** (shift / 12);
        const firstOutput = Math.max(0, center - halfGrain);
        const lastOutput = Math.min(mono.length, center + halfGrain);
        for (let outputIndex = firstOutput; outputIndex < lastOutput; outputIndex += 1) {
          const relative = outputIndex - center;
          const sourcePosition = center + relative * ratio;
          if (sourcePosition < 0 || sourcePosition >= mono.length - 1) continue;
          const lower = Math.floor(sourcePosition);
          const fraction = sourcePosition - lower;
          const sample = mono[lower] * (1 - fraction) + mono[lower + 1] * fraction;
          const phase = (relative + halfGrain) / grainSize;
          const weight = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
          output[outputIndex] += sample * weight;
          weightSum[outputIndex] += weight;
        }
        if (grainIndex % 128 === 0) {
          const progress = 35 + Math.round(((intervalIndex + center / mono.length) / intervals.length) * 64);
          onProgress?.(`Building ${interval.replace('-', ' ')} harmony… ${Math.min(99, progress)}%`);
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      }

      const harmonyBuffer = context.createBuffer(1, output.length, sampleRate);
      const harmonyData = harmonyBuffer.getChannelData(0);
      for (let index = 0; index < output.length; index += 1) {
        harmonyData[index] = weightSum[index] > 0 ? output[index] / weightSum[index] : 0;
      }
      harmonies.push({ interval, blob: encodeWav(harmonyBuffer) });
    }
    return { key, scale, detectedKey, harmonies };
  } finally {
    await context.close();
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function formatTimelineTime(seconds) {
  return formatTime(seconds) === '--:--' ? '00:00' : formatTime(seconds);
}

function disconnectRecordingGraph(graph) {
  if ('onaudioprocess' in graph.processor) graph.processor.onaudioprocess = null;
  if (graph.processor.port) graph.processor.port.onmessage = null;
  graph.source.disconnect();
  graph.processor.disconnect();
  graph.mute.disconnect();
}

export default function HomePage() {
  const [projectName, setProjectName] = useState('Untitled Naat');
  const [projectStarted, setProjectStarted] = useState(false);
  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [leadSegments, setLeadSegments] = useState([]);
  const [previousLeadTakes, setPreviousLeadTakes] = useState([]);
  const [previewUrl, setPreviewUrl] = useState('');
  const [backgroundLayers, setBackgroundLayers] = useState([]);
  const [duration, setDuration] = useState(null);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [settings, setSettings] = useState(initialSettings);
  const [isExporting, setIsExporting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [recordingRequest, setRecordingRequest] = useState(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [harmonyKey, setHarmonyKey] = useState('auto');
  const [harmonyScale, setHarmonyScale] = useState('auto');
  const [harmonyIntervals, setHarmonyIntervals] = useState(['third-below', 'third-above']);
  const [harmonyDetection, setHarmonyDetection] = useState(null);
  const [harmonyProgress, setHarmonyProgress] = useState('');
  const [isGeneratingHarmony, setIsGeneratingHarmony] = useState(false);
  const [microphones, setMicrophones] = useState([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState('');
  const [inputLevel, setInputLevel] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [message, setMessage] = useState('');
  const [projectLoaded, setProjectLoaded] = useState(false);
  const fileInputRef = useRef(null);
  const layerFileInputRef = useRef(null);
  const leadSegmentUrlsRef = useRef([]);
  const pendingLayerRoleRef = useRef(null);
  const audioRef = useRef(null);
  const livePreviewRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const recordingContextRef = useRef(null);
  const recordingGraphRef = useRef(null);
  const recordingSamplesRef = useRef([]);
  const recordingFrameCountRef = useRef(0);
  const recordingEnergyRef = useRef(0);
  const lastMeterUpdateRef = useRef(0);
  const recordingTargetRef = useRef(null);
  const backgroundLayerUrlsRef = useRef([]);

  useEffect(() => {
    if (!audioUrl) return undefined;
    return () => URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => {
    backgroundLayerUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    leadSegmentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => () => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (recordingGraphRef.current) disconnectRecordingGraph(recordingGraphRef.current);
    if (recordingContextRef.current) void recordingContextRef.current.close();
    if (livePreviewRef.current) {
      livePreviewRef.current.source.disconnect();
      void livePreviewRef.current.context.close();
      livePreviewRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isRecording) return undefined;
    const timer = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    try {
      const savedProject = window.localStorage.getItem('naat-studio-project');
      if (savedProject) {
        const project = JSON.parse(savedProject);
        if (typeof project.projectName === 'string') setProjectName(project.projectName);
        if (typeof project.projectStarted === 'boolean') setProjectStarted(project.projectStarted);
        if (typeof project.selectedPreset === 'string') setSelectedPreset(project.selectedPreset);
        if (
          project.settings
          && ['reverb', 'warmth', 'clarity', 'compression', 'output'].every(
            (key) => Number.isFinite(project.settings[key]) && project.settings[key] >= 0 && project.settings[key] <= 100,
          )
        ) {
          setSettings({
            ...initialSettings,
            ...project.settings,
            stereoWidth: Number.isFinite(project.settings.stereoWidth)
              ? Math.max(0, Math.min(100, project.settings.stereoWidth))
              : initialSettings.stereoWidth,
            delayMode: ['off', 'short', 'long', 'pingpong'].includes(project.settings.delayMode)
              ? project.settings.delayMode
              : initialSettings.delayMode,
            delayMix: Number.isFinite(project.settings.delayMix)
              ? Math.max(0, Math.min(100, project.settings.delayMix))
              : initialSettings.delayMix,
            delayTimeMs: Number.isFinite(project.settings.delayTimeMs)
              ? Math.max(80, Math.min(2000,
                project.selectedPreset === 'Gulam Mustafa Qadri Inspired'
                  && project.settings.delayMode === 'pingpong'
                  && project.settings.delayTimeMs === 420
                  ? 240
                  : project.settings.delayTimeMs,
              ))
              : initialSettings.delayTimeMs,
            delayFeedback: Number.isFinite(project.settings.delayFeedback)
              ? Math.max(0, Math.min(85, project.settings.delayFeedback))
              : initialSettings.delayFeedback,
            delayTone: Number.isFinite(project.settings.delayTone)
              ? Math.max(0, Math.min(100, project.settings.delayTone))
              : initialSettings.delayTone,
            vocalGainDb: project.settingsVersion >= 3 && Number.isFinite(project.settings.vocalGainDb)
              ? Math.max(0, Math.min(12, project.settings.vocalGainDb))
              : initialSettings.vocalGainDb,
            noiseGate: project.settingsVersion >= 3 && typeof project.settings.noiseGate === 'boolean'
              ? project.settings.noiseGate
              : initialSettings.noiseGate,
            noiseGateThresholdDb: Number.isFinite(project.settings.noiseGateThresholdDb)
              ? Math.max(-70, Math.min(-30, project.settings.noiseGateThresholdDb))
              : initialSettings.noiseGateThresholdDb,
          });
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? `Could not restore saved project: ${error.message}` : 'Could not restore saved project.');
    }
    readSavedProjectAudio()
      .then((savedAudio) => {
        if (savedAudio?.lead instanceof Blob) {
          const lead = savedAudio.lead instanceof File
            ? savedAudio.lead
            : new File([savedAudio.lead], savedAudio.leadName || 'lead-recording.wav', {
              type: savedAudio.leadType || 'audio/wav',
            });
          setAudioFile(lead);
          setAudioUrl(URL.createObjectURL(lead));
          setDuration(null);
        }
        if (Array.isArray(savedAudio?.layers)) {
          const layers = savedAudio.layers.map((layer) => {
            const file = layer.file instanceof File
              ? layer.file
              : new File([layer.file], layer.fileName, { type: layer.fileType });
            const url = URL.createObjectURL(file);
            backgroundLayerUrlsRef.current.push(url);
            return { ...layer, file, url };
          });
          setBackgroundLayers(layers);
        }
        if (Array.isArray(savedAudio?.previousLeadTakes)) {
          setPreviousLeadTakes(savedAudio.previousLeadTakes.map((take) => ({
            ...take,
            file: take.file instanceof File
              ? take.file
              : new File([take.file], take.fileName, { type: take.fileType }),
          })));
        }
        if (Array.isArray(savedAudio?.leadSegments)) {
          const segments = savedAudio.leadSegments.map((segment) => {
            const file = segment.file instanceof File
              ? segment.file
              : new File([segment.file], segment.fileName, { type: segment.fileType });
            const url = URL.createObjectURL(file);
            leadSegmentUrlsRef.current.push(url);
            return { ...segment, file, url };
          });
          setLeadSegments(segments);
        }
      })
      .catch((error) => {
        setMessage(error instanceof Error ? `Could not restore local audio: ${error.message}` : 'Could not restore local audio.');
      })
      .finally(() => setProjectLoaded(true));
  }, []);

  useEffect(() => {
    if (!projectLoaded) return;
    try {
      window.localStorage.setItem('naat-studio-project', JSON.stringify({
        settingsVersion: 3,
        projectName,
        projectStarted,
        selectedPreset,
        settings,
      }));
    } catch (error) {
      setMessage(error instanceof Error ? `Could not save project settings: ${error.message}` : 'Could not save project settings.');
    }
  }, [projectLoaded, projectName, projectStarted, selectedPreset, settings]);

  useEffect(() => {
    if (!projectLoaded) return;
    saveProjectAudio({
      lead: audioFile,
      leadName: audioFile?.name || '',
      leadType: audioFile?.type || '',
      leadSegments: leadSegments.map(({ id, file, offset, duration: segmentDuration }) => ({
        id,
        file,
        fileName: file.name,
        fileType: file.type,
        offset,
        duration: segmentDuration,
      })),
      previousLeadTakes: previousLeadTakes.map(({ id, file }) => ({
        id,
        file,
        fileName: file.name,
        fileType: file.type,
      })),
      layers: backgroundLayers.map(({ id, role, name, file, volume, pan, offset, muted }) => ({
        id,
        role,
        name,
        file,
        fileName: file.name,
        fileType: file.type,
        volume,
        pan,
        offset,
        muted,
      })),
    }).catch((error) => {
      setMessage(error instanceof Error ? `Could not save local audio: ${error.message}` : 'Could not save local audio.');
    });
  }, [projectLoaded, audioFile, backgroundLayers, leadSegments, previousLeadTakes]);

  const beginProject = () => {
    setProjectStarted(true);
    setMessage('');
    requestAnimationFrame(() => document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth' }));
  };

  const openAudioPicker = () => {
    setProjectStarted(true);
    requestAnimationFrame(() => fileInputRef.current?.click());
  };

  const loadAudioFile = (file, preserveCurrent = true) => {
    const hasCurrentLead = Boolean(audioFile);
    if (preserveCurrent && audioFile) {
      setPreviousLeadTakes((current) => [
        { id: `${Date.now()}-${Math.random()}`, file: audioFile },
        ...current,
      ]);
    }
    const nextUrl = URL.createObjectURL(file);
    setAudioFile(file);
    setAudioUrl(nextUrl);
    setPreviewUrl('');
    if (!hasCurrentLead) {
      setProjectName((current) => current === 'Untitled Naat' ? file.name.replace(/\.[^.]+$/, '') : current);
      setSelectedPreset('');
      setSettings(initialSettings);
    }
    setDuration(null);
    setMessage('');
    setRecordingSeconds(0);
    if (audioRef.current) audioRef.current.load();
  };

  const addLeadSegment = (file, offset, segmentDuration) => {
    const url = URL.createObjectURL(file);
    leadSegmentUrlsRef.current.push(url);
    setLeadSegments((current) => [
      ...current,
      { id: `${Date.now()}-${Math.random()}`, file, url, offset, duration: segmentDuration },
    ]);
    clearProcessedPreview();
  };

  const removeLeadSegment = (segmentId) => {
    setLeadSegments((current) => {
      const segment = current.find((item) => item.id === segmentId);
      if (segment) {
        URL.revokeObjectURL(segment.url);
        leadSegmentUrlsRef.current = leadSegmentUrlsRef.current.filter((url) => url !== segment.url);
      }
      return current.filter((item) => item.id !== segmentId);
    });
    clearProcessedPreview();
  };

  const updateLeadSegment = (segmentId, changes) => {
    setLeadSegments((current) => current.map((segment) => (
      segment.id === segmentId ? { ...segment, ...changes } : segment
    )));
    clearProcessedPreview();
  };

  const activatePreviousLeadTake = (take) => {
    setPreviousLeadTakes((current) => current.filter((item) => item.id !== take.id));
    loadAudioFile(take.file);
    setMessage(`Restored lead take: ${take.file.name}. Previous active lead saved in the take list.`);
  };

  const loadLayerFile = (file, role, options = {}) => {
    const url = URL.createObjectURL(file);
    backgroundLayerUrlsRef.current.push(url);
    const layer = {
      id: `${Date.now()}-${Math.random()}`,
      role: role.id,
      name: role.label,
      file,
      url,
      volume: role.volume,
      pan: role.pan,
      offset: options.offset ?? 0,
      muted: options.muted ?? false,
    };
    setBackgroundLayers((current) => [...current, layer]);
    clearProcessedPreview();
    setMessage(`${role.label} added. Keep it below the lead so the main recitation stays clear.`);
  };

  const clearProcessedPreview = () => {
    setPreviewUrl('');
    setIsPlaying(false);
    livePreviewRef.current?.graph.setEnabled(false);
    const audio = audioRef.current;
    if (audio && audioUrl) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = audioUrl;
      audio.load();
    }
  };

  const selectAudio = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setMessage('Choose an audio file to create a vocal project.');
      event.target.value = '';
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setMessage('The selected audio is larger than the 500 MB limit.');
      event.target.value = '';
      return;
    }

    loadAudioFile(file);
    event.target.value = '';
  };

  const selectLayerAudio = (event) => {
    const file = event.target.files?.[0];
    const role = pendingLayerRoleRef.current;
    pendingLayerRoleRef.current = null;
    if (!file || !role) return;
    if (!file.type.startsWith('audio/')) {
      setMessage('Choose an audio file for the background vocal layer.');
      event.target.value = '';
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setMessage('The selected harmony vocal is larger than the 500 MB limit.');
      event.target.value = '';
      return;
    }
    loadLayerFile(file, role);
    event.target.value = '';
  };

  const openLayerPicker = (role) => {
    pendingLayerRoleRef.current = role;
    layerFileInputRef.current?.click();
  };

  const updateLayer = (layerId, changes) => {
    setBackgroundLayers((current) => current.map((layer) => (
      layer.id === layerId ? { ...layer, ...changes } : layer
    )));
    clearProcessedPreview();
  };

  const removeLayer = (layerId) => {
    setBackgroundLayers((current) => {
      const layer = current.find((item) => item.id === layerId);
      if (layer) {
        URL.revokeObjectURL(layer.url);
        backgroundLayerUrlsRef.current = backgroundLayerUrlsRef.current.filter((url) => url !== layer.url);
      }
      return current.filter((layerItem) => layerItem.id !== layerId);
    });
    clearProcessedPreview();
  };

  const requestRecording = (role = null) => {
    audioRef.current?.pause();
    setMessage('Recording setup opened. Confirm the next step to request microphone access and start a new take.');
    setRecordingRequest({ role });
  };

  const refreshMicrophones = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicrophones(devices.filter((device) => device.kind === 'audioinput'));
    } catch (error) {
      setMessage(error instanceof Error ? `Could not list microphones: ${error.message}` : 'Could not list microphones.');
    }
  };

  const startRecording = async (role = null) => {
    const RecordingAudioContext = window.AudioContext || window.webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !RecordingAudioContext) {
      setMessage('Recording is not supported in this browser. Try a current version of Chrome, Edge, Firefox, or Safari over HTTPS.');
      return;
    }

    setProjectStarted(true);
    setIsStartingRecording(true);
    recordingTargetRef.current = role;
    audioRef.current?.pause();
    setMessage('Requesting microphone access…');
    let stream;
    let context;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          ...(selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : {}),
        },
      });
      recordingStreamRef.current = stream;
      await refreshMicrophones();
      context = new RecordingAudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const mute = context.createGain();
      mute.gain.value = 0;
      recordingSamplesRef.current = [];
      recordingFrameCountRef.current = 0;
      recordingEnergyRef.current = 0;
      lastMeterUpdateRef.current = 0;
      let processor;
      const appendSamples = (samples) => {
        recordingSamplesRef.current.push(samples);
        recordingFrameCountRef.current += samples.length;
        let energy = 0;
        for (let index = 0; index < samples.length; index += 1) energy += samples[index] * samples[index];
        recordingEnergyRef.current += energy;
        const now = performance.now();
        if (now - lastMeterUpdateRef.current >= 80) {
          const rms = Math.sqrt(energy / samples.length);
          setInputLevel(Math.min(1, rms * 4));
          lastMeterUpdateRef.current = now;
        }
      };
      if (context.audioWorklet && window.AudioWorkletNode) {
        const workletSource = `
          class NaatRecorderProcessor extends AudioWorkletProcessor {
            process(inputs) {
              const input = inputs[0]?.[0];
              if (input?.length) this.port.postMessage(input.slice());
              return true;
            }
          }
          registerProcessor('naat-recorder', NaatRecorderProcessor);
        `;
        const workletUrl = URL.createObjectURL(new Blob([workletSource], { type: 'application/javascript' }));
        try {
          await context.audioWorklet.addModule(workletUrl);
        } finally {
          URL.revokeObjectURL(workletUrl);
        }
        processor = new window.AudioWorkletNode(context, 'naat-recorder', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        processor.port.onmessage = (event) => {
          appendSamples(event.data);
        };
      } else {
        processor = context.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (event) => {
          const input = event.inputBuffer.getChannelData(0);
          appendSamples(new Float32Array(input));
          event.outputBuffer.getChannelData(0).fill(0);
        };
      }
      source.connect(processor);
      processor.connect(mute);
      mute.connect(context.destination);
      recordingContextRef.current = context;
      recordingGraphRef.current = { source, processor, mute };
      setRecordingSeconds(0);
      setIsRecording(true);
      setMessage(role
        ? `Microphone connected. Recording ${role.label}; select Stop when you are done.`
        : 'Microphone connected. Recording a new lead take; select Stop when you are done.');
      if (role && role.id !== 'lead-segment' && audioRef.current && audioFile) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch((error) => {
          setMessage(error instanceof Error
            ? `Harmony take is recording, but lead cue playback did not start: ${error.message}. Use the player and headphones to keep it in time.`
            : 'Harmony take is recording, but lead cue playback did not start. Use the player and headphones to keep it in time.');
        });
      }
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      if (context && context.state !== 'closed') await context.close();
      recordingContextRef.current = null;
      recordingGraphRef.current = null;
      recordingTargetRef.current = null;
      setInputLevel(0);
      setMessage(error instanceof Error ? `Could not access the microphone: ${error.message}` : 'Could not access the microphone. Check browser permissions and try again.');
    } finally {
      setIsStartingRecording(false);
    }
  };

  const stopRecording = () => {
    const graph = recordingGraphRef.current;
    const context = recordingContextRef.current;
    const stream = recordingStreamRef.current;
    if (!graph || !context) return;

    disconnectRecordingGraph(graph);
    stream?.getTracks().forEach((track) => track.stop());
    recordingGraphRef.current = null;
    recordingStreamRef.current = null;
    setIsRecording(false);
    setInputLevel(0);

    const frameCount = recordingFrameCountRef.current;
    if (frameCount === 0) {
      void context.close();
      recordingContextRef.current = null;
      recordingTargetRef.current = null;
      setMessage('No audio was captured. Check that the microphone is enabled and try recording again.');
      return;
    }

    const samples = new Float32Array(frameCount);
    let writeOffset = 0;
    recordingSamplesRef.current.forEach((chunk) => {
      samples.set(chunk, writeOffset);
      writeOffset += chunk.length;
    });
    const audioBuffer = context.createBuffer(1, frameCount, context.sampleRate);
    audioBuffer.copyToChannel(samples, 0);
    const blob = encodeWav(audioBuffer);
    const file = new File([blob], `naat-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`, {
      type: 'audio/wav',
      lastModified: Date.now(),
    });
    void context.close();
    recordingContextRef.current = null;
    setProjectStarted(true);
    const role = recordingTargetRef.current;
    recordingTargetRef.current = null;
    const rms = Math.sqrt(recordingEnergyRef.current / frameCount);
    if (role?.id === 'lead-segment') {
      const segmentDuration = frameCount / audioBuffer.sampleRate;
      addLeadSegment(file, role.offset, segmentDuration);
      setMessage(rms < 0.001
        ? `${role.label} saved at ${formatTime(role.offset)}, but its input was nearly silent. Check your microphone and record it again.`
        : `${role.label} recorded (${formatTime(segmentDuration)}) and added at ${formatTime(role.offset)}. Record another part or adjust its position below.`);
    } else if (role) {
      loadLayerFile(file, role);
      setMessage(rms < 0.001
        ? `${role.label} take saved, but its input was nearly silent. Select/check your microphone and record again.`
        : `${role.label} recorded (${formatTime(frameCount / audioBuffer.sampleRate)}). Listen back and adjust its level beneath the lead.`);
    } else {
      loadAudioFile(file);
      setMessage(rms < 0.001
        ? 'Take saved, but the microphone input was nearly silent. Select/check your microphone and record again.'
        : `Recording ready (${formatTime(frameCount / audioBuffer.sampleRate)}). Play it back, choose a preset, or export your processed WAV mix.`);
    }
  };

  const applyPreset = (preset) => {
    const nextSettings = { ...initialSettings, ...preset.settings };
    setSettings(nextSettings);
    livePreviewRef.current?.graph.update(nextSettings);
    setSelectedPreset(preset.name);
    setMessage(`${preset.name} applied. Adjust any control to personalize it.`);
  };

  const updateSetting = (key, value) => {
    const nextSettings = { ...settings, [key]: Number(value) };
    setSettings(nextSettings);
    livePreviewRef.current?.graph.update(nextSettings);
    setSelectedPreset('');
  };

  const renderMixBlob = async () => {
    if (!audioFile) throw new Error('Import or record a lead vocal before mixing.');
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AudioContextClass || !OfflineContextClass) {
      throw new Error('This browser does not support offline audio mixing.');
    }

    const decoder = new AudioContextClass();
    try {
      const files = [
        { file: audioFile, volume: 100, pan: 0, offset: 0 },
        ...leadSegments.map((segment) => ({
          file: segment.file,
          volume: 100,
          pan: 0,
          offset: segment.offset,
        })),
        ...backgroundLayers
          .filter((layer) => !layer.muted && !retiredLayerRoles.has(layer.role))
          .map((layer) => ({ ...layer, offset: Number(layer.offset) || 0 })),
      ];
      const decoded = [];
      for (const track of files) {
        const buffer = await decoder.decodeAudioData(await track.file.arrayBuffer());
        decoded.push({
          ...track,
          buffer: settings.noiseGate ? applyNoiseGate(buffer, settings.noiseGateThresholdDb) : buffer,
        });
      }

      const sampleRate = decoded[0].buffer.sampleRate;
      const feedback = (settings.delayFeedback / 100) * 0.86;
      const repeatCount = settings.delayMode === 'off' || feedback <= 0
        ? 1
        : Math.min(14, Math.ceil(Math.log(0.01) / Math.log(feedback)));
      const delayTailSeconds = settings.delayMode === 'off'
        ? 0
        : (settings.delayTimeMs / 1000) * repeatCount;
      const tailFrames = Math.ceil(sampleRate * (2.4 + delayTailSeconds));
      const frameCount = Math.max(
        ...decoded.map((track) => Math.ceil(track.offset * sampleRate) + track.buffer.length),
      ) + tailFrames;
      const offline = new OfflineContextClass(2, frameCount, sampleRate);
      const master = offline.createDynamicsCompressor();
      master.threshold.value = -1.5;
      master.knee.value = 0;
      master.ratio.value = 20;
      master.attack.value = 0.003;
      master.release.value = 0.12;
      master.connect(offline.destination);

      decoded.forEach((track) => {
        const source = offline.createBufferSource();
        source.buffer = track.buffer;
        configureAudioGraph(offline, source, settings, master, track);
        source.start(Math.max(0, track.offset));
      });

      return encodeWav(await offline.startRendering());
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Audio could not be mixed in this browser.');
    } finally {
      await decoder.close();
    }
  };

  const renderDryPreviewBlob = async () => {
    if (!audioFile) throw new Error('Import or record a lead vocal before previewing.');
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AudioContextClass || !OfflineContextClass) {
      throw new Error('This browser does not support live audio preview.');
    }

    const decoder = new AudioContextClass();
    try {
      const tracks = [
        { file: audioFile, volume: 100, pan: 0, offset: 0 },
        ...leadSegments.map((segment) => ({
          file: segment.file,
          volume: 100,
          pan: 0,
          offset: segment.offset,
        })),
        ...backgroundLayers
          .filter((layer) => !layer.muted && !retiredLayerRoles.has(layer.role))
          .map((layer) => ({ ...layer, offset: Number(layer.offset) || 0 })),
      ];
      const decoded = [];
      for (const track of tracks) {
        decoded.push({
          ...track,
          buffer: await decoder.decodeAudioData(await track.file.arrayBuffer()),
        });
      }

      const sampleRate = decoded[0].buffer.sampleRate;
      const feedback = (settings.delayFeedback / 100) * 0.86;
      const repeatCount = settings.delayMode === 'off' || feedback <= 0
        ? 1
        : Math.min(14, Math.ceil(Math.log(0.01) / Math.log(feedback)));
      const delayTailSeconds = settings.delayMode === 'off'
        ? 0
        : (settings.delayTimeMs / 1000) * repeatCount;
      const frameCount = Math.max(
        ...decoded.map((track) => Math.ceil(track.offset * sampleRate) + track.buffer.length),
      ) + Math.ceil(sampleRate * (2.4 + delayTailSeconds));
      const offline = new OfflineContextClass(2, frameCount, sampleRate);
      const limiter = offline.createDynamicsCompressor();
      limiter.threshold.value = -1.5;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.12;
      limiter.connect(offline.destination);

      decoded.forEach((track) => {
        const source = offline.createBufferSource();
        const gain = offline.createGain();
        const panner = offline.createStereoPanner();
        source.buffer = track.buffer;
        gain.gain.value = (track.volume ?? 100) / 100;
        panner.pan.value = (track.pan ?? 0) / 100;
        source.connect(gain);
        gain.connect(panner);
        panner.connect(limiter);
        source.start(Math.max(0, track.offset));
      });

      return encodeWav(await offline.startRendering());
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'A live preview source could not be prepared.');
    } finally {
      await decoder.close();
    }
  };

  const playAudio = async () => {
    const audio = audioRef.current;
    if (!audio || !audioFile) return;
    if (isPlaying) {
      audio.pause();
      return;
    }

    setMessage('Preparing live effects preview…');
    let nextUrl;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('This browser does not support live audio effects.');
      if (!livePreviewRef.current || livePreviewRef.current.element !== audio) {
        const context = new AudioContextClass();
        const source = context.createMediaElementSource(audio);
        const graph = configureAudioGraph(context, source, settings, context.destination, {}, false, true);
        livePreviewRef.current = { context, source, graph, element: audio };
      }
      const preview = livePreviewRef.current;
      preview.graph.update(settings);
      await preview.context.resume();
      const blob = await renderDryPreviewBlob();
      nextUrl = URL.createObjectURL(blob);
      audio.pause();
      audio.src = nextUrl;
      audio.load();
      await new Promise((resolve, reject) => {
        if (audio.readyState >= 3) {
          resolve();
          return;
        }
        audio.addEventListener('canplay', resolve, { once: true });
        audio.addEventListener('error', () => reject(new Error('The rendered mix could not be loaded for playback.')), { once: true });
      });
      preview.graph.setEnabled(true);
      await audio.play();
      setPreviewUrl(nextUrl);
      setMessage('Live effects preview is playing. Change any control or preset while it plays to hear the change immediately.');
    } catch (error) {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      livePreviewRef.current?.graph.setEnabled(false);
      if (audioUrl) {
        audio.src = audioUrl;
        audio.load();
      }
      setMessage(error instanceof Error ? `Preview failed: ${error.message}` : 'Preview failed.');
    }
  };

  const exportMix = async () => {
    if (!audioFile) {
      setMessage('Import a recording before exporting a mix.');
      return;
    }
    setIsExporting(true);
    setMessage('Rendering your processed WAV mix in this browser…');
    try {
      const blob = await renderMixBlob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${projectName.trim() || 'naat-mix'}-mix.wav`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setMessage(`Mix exported as WAV with ${leadSegments.length} additional lead part(s) and ${backgroundLayers.filter((layer) => !layer.muted && !retiredLayerRoles.has(layer.role)).length} harmony track(s).`);
    } catch (error) {
      setMessage(error instanceof Error ? `Export failed: ${error.message}` : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const createHarmonyLayer = async () => {
    if (!audioFile) {
      setMessage('Record or import the lead vocal before generating a harmony.');
      return;
    }
    if (harmonyIntervals.length === 0) {
      setMessage('Choose at least one harmony part to generate.');
      return;
    }
    setIsGeneratingHarmony(true);
    setHarmonyProgress('Preparing lead vocal…');
    setMessage('');
    try {
      const result = await generateScaleHarmonies(
        audioFile,
        harmonyKey,
        harmonyScale,
        harmonyIntervals,
        setHarmonyProgress,
      );
      setHarmonyDetection({
        key: result.detectedKey.key,
        scale: result.detectedKey.scale,
        usedKey: result.key,
        usedScale: result.scale,
      });
      result.harmonies.forEach(({ interval, blob }) => {
        const harmonyFile = new File(
          [blob],
          `${projectName.trim() || 'naat'}-${result.key}-${result.scale}-${interval}-harmony.wav`,
          { type: 'audio/wav', lastModified: Date.now() },
        );
        loadLayerFile(harmonyFile, {
          id: `generated-harmony-${Date.now()}-${interval}`,
          label: `${result.key} ${result.scale} · ${interval.replace('-', ' ')}`,
          volume: 18,
          pan: interval.endsWith('below') ? -12 : 12,
        });
      });
      setMessage(`Estimated ${result.detectedKey.key} ${result.detectedKey.scale}; created ${result.harmonies.length} vocal harmony part(s). The key estimate can be imperfect, so check the blend by ear.`);
    } catch (error) {
      setMessage(error instanceof Error ? `Harmony generation failed: ${error.message}` : 'Harmony generation failed.');
    } finally {
      setIsGeneratingHarmony(false);
      setHarmonyProgress('');
    }
  };

  const controls = [
    { key: 'reverb', label: 'Room reverb', detail: 'Vocal space' },
    { key: 'warmth', label: 'Warmth', detail: 'Low-mid body' },
    { key: 'clarity', label: 'Clarity', detail: 'Presence' },
    { key: 'compression', label: 'Compression', detail: 'Dynamic control' },
    { key: 'vocalGainDb', label: 'Vocal level boost', detail: '0–12 dB · before compression' },
    { key: 'stereoWidth', label: 'Stereo width', detail: 'Subtle vocal spread' },
    { key: 'delayMix', label: 'Echo level', detail: 'Repeat volume' },
    { key: 'delayTimeMs', label: 'Delay time', detail: 'Time between repeats' },
    { key: 'delayFeedback', label: 'Echo repeats', detail: 'Feedback amount' },
    { key: 'delayTone', label: 'Echo tone', detail: 'Darker to brighter repeats' },
    { key: 'output', label: 'Output level', detail: 'Safe gain' },
  ];
  const nextLeadSegmentOffset = Math.max(
    duration || 0,
    ...leadSegments.map((segment) => segment.offset + segment.duration),
  );
  const visibleBackgroundLayers = backgroundLayers.filter((layer) => !retiredLayerRoles.has(layer.role));

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
        <a href="#" className="flex items-center gap-3" aria-label="Naat-App home">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-black shadow-glow">N</span>
          <span>
            <span className="block text-lg font-bold tracking-wide">Naat-App</span>
            <span className="block text-[10px] uppercase tracking-[0.35em] text-slate-400">vocal studio</span>
          </span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
          <a href="#studio" className="transition hover:text-white">Studio</a>
          <a href="#presets" className="transition hover:text-white">Presets</a>
        </nav>
        <button type="button" onClick={beginProject} className="rounded-full border border-brand-400/40 bg-brand-500/10 px-5 py-2 text-sm font-semibold text-brand-100 transition hover:bg-brand-500/20">
          Start Project
        </button>
      </header>

      {recordingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="recording-dialog-title" className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.25em] text-rose-300">Recording setup</p>
            <h2 id="recording-dialog-title" className="mt-3 text-2xl font-bold text-white">
              Ready to record {recordingRequest.role ? `“${recordingRequest.role.label}”` : 'your lead vocal'}?
            </h2>
            <p className="mt-3 leading-7 text-slate-300">
              Nothing is recording yet. Your microphone will only be requested after you choose <strong>Begin recording</strong>. {recordingRequest.role?.id === 'lead-segment'
                ? `This part will be added to the lead at ${formatTimelineTime(recordingRequest.role.offset)}.`
                : `This is a new ${recordingRequest.role ? 'harmony take' : 'lead take'}; it will be added without removing your current lead or other takes.`} You can stop it at any time.
            </p>
            <p className="mt-3 text-sm text-slate-400">
              If the setup closes without recording, allow microphone access in your browser and try again.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setRecordingRequest(null)} className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500">
                Cancel
              </button>
              <button type="button" onClick={() => { const { role } = recordingRequest; setRecordingRequest(null); void startRecording(role); }} className="rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500">
                Begin recording
              </button>
            </div>
          </section>
        </div>
      )}

      {!projectStarted && (
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-24 pt-12 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
          <div>
            <div className="mb-6 inline-flex rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.25em] text-brand-200">
              A dedicated naat vocal studio
            </div>
            <h1 className="max-w-2xl text-5xl font-black leading-tight tracking-tight md:text-6xl">
              Make your recitation sound finished, not just recorded.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Create a project, import your own recording, shape the vocal tone, audition the effects, and export a processed WAV mix. No instruments. Your recording stays on your device.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <button type="button" onClick={beginProject} className="rounded-full bg-brand-500 px-6 py-3 font-semibold text-white shadow-glow transition hover:bg-brand-400">Start a project</button>
              <button type="button" onClick={openAudioPicker} className="rounded-full border border-slate-700 bg-slate-900 px-6 py-3 font-semibold text-slate-100 transition hover:border-slate-600">Import a recording</button>
              <button type="button" onClick={() => requestRecording()} disabled={isStartingRecording || isRecording} className="rounded-full border border-rose-400/40 bg-rose-500/10 px-6 py-3 font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-wait disabled:opacity-50">
                {isStartingRecording ? 'Requesting microphone…' : 'Record new lead take'}
              </button>
            </div>
            <p className="mt-5 text-sm text-slate-400">Local browser processing · WAV export · No AI/API key required for this studio MVP</p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <p className="text-xs uppercase tracking-[0.25em] text-brand-300">Production approach</p>
            <h2 className="mt-3 text-2xl font-bold">Vocal first. Controlled. Clear.</h2>
            <p className="mt-3 leading-7 text-slate-300">Use a reference-inspired starting point, then adjust the sound for the singer and the recording. Presets are editable settings—not copied audio or a voice clone.</p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              {['Room reverb', 'Vocal warmth', 'Presence EQ', 'Dynamics control'].map((item) => (
                <div key={item} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-200">{item}</div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="studio" className={`mx-auto max-w-7xl scroll-mt-6 px-6 pb-20 lg:px-8 ${projectStarted ? 'pt-8' : 'pt-0'}`}>
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 md:p-8">
          <div className="flex flex-col justify-between gap-5 border-b border-slate-800 pb-6 md:flex-row md:items-end">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-brand-300">Project workspace</p>
              <label htmlFor="project-name" className="sr-only">Project name</label>
              <input id="project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} className="mt-2 w-full max-w-xl border-0 border-b border-slate-700 bg-transparent px-0 py-2 text-2xl font-bold text-white focus:border-brand-400 focus:ring-0 md:text-3xl" />
              <p className="mt-2 text-sm text-slate-400">Project name, settings, lead takes, and harmony tracks save in this browser. Audio is not uploaded to a server.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isRecording || isStartingRecording} className="rounded-full border border-brand-400/40 bg-brand-500/10 px-5 py-2.5 text-sm font-semibold text-brand-100 hover:bg-brand-500/20 disabled:opacity-50">
                {audioFile ? 'Replace audio' : 'Import audio'}
              </button>
              {isRecording ? (
                <button type="button" onClick={stopRecording} className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500">
                  <span className="h-2.5 w-2.5 rounded-sm bg-white" aria-hidden="true" />
                  Stop {recordingTargetRef.current?.id === 'lead-segment' ? 'part' : recordingTargetRef.current ? 'harmony take' : 'recording'} · {formatTime(recordingSeconds)}
                </button>
              ) : (
                <button type="button" onClick={() => requestRecording()} disabled={isStartingRecording} className="rounded-full border border-rose-400/40 bg-rose-500/10 px-5 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/20 disabled:cursor-wait disabled:opacity-50">
                  {isStartingRecording ? 'Requesting microphone…' : 'Record new lead take'}
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Recording uses two steps: choose Record, then choose Begin recording in the setup dialog. Microphone access starts only after confirmation.
            </p>
          </div>

          {microphones.length > 0 && (
            <label className="mt-5 block max-w-xl text-sm text-slate-300">
              <span className="mb-2 block font-medium">Microphone input</span>
              <select value={selectedMicrophoneId} onChange={(event) => setSelectedMicrophoneId(event.target.value)} disabled={isRecording || isStartingRecording} className="w-full rounded-xl border-slate-700 bg-slate-950 text-white focus:border-brand-400 focus:ring-brand-400 disabled:opacity-60">
                <option value="">System default microphone</option>
                {microphones.map((microphone, index) => (
                  <option key={microphone.deviceId || `microphone-${index}`} value={microphone.deviceId}>
                    {microphone.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}

          {isRecording && (
            <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4" aria-live="polite">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium text-rose-100">Live microphone input</span>
                <span className="text-slate-400">{inputLevel > 0.01 ? 'Input detected' : 'Speak into the selected mic to check the level'}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 transition-[width] duration-100" style={{ width: `${Math.max(inputLevel * 100, 1)}%` }} />
              </div>
            </div>
          )}

          {message && <p role="status" className="mt-5 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200">{message}</p>}

          <input ref={fileInputRef} type="file" accept="audio/*,.wav,.mp3,.flac,.m4a,.ogg" onChange={selectAudio} className="sr-only" aria-label="Choose an audio recording" />
          <input ref={layerFileInputRef} type="file" accept="audio/*,.wav,.mp3,.flac,.m4a,.ogg" onChange={selectLayerAudio} className="sr-only" aria-label="Choose a background vocal recording" />

          {!audioFile ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <button type="button" disabled={isRecording || isStartingRecording} onClick={() => fileInputRef.current?.click()} className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/70 p-8 text-center transition hover:border-brand-400/70 hover:bg-brand-500/5 disabled:opacity-50">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/15 text-2xl text-brand-200" aria-hidden="true">↑</span>
                <span className="mt-4 text-lg font-semibold">Import an audio file</span>
                <span className="mt-2 text-sm text-slate-400">WAV, MP3, FLAC, M4A, or browser-supported audio</span>
              </button>
              <button type="button" onClick={isRecording ? stopRecording : () => requestRecording()} disabled={isStartingRecording} className={`flex min-h-48 flex-col items-center justify-center rounded-2xl border p-8 text-center transition disabled:cursor-wait disabled:opacity-50 ${isRecording ? 'border-rose-400/70 bg-rose-500/10' : 'border-dashed border-rose-400/40 bg-slate-950/70 hover:border-rose-400/80 hover:bg-rose-500/5'}`}>
                <span className={`flex h-12 w-12 items-center justify-center rounded-full text-xl text-white ${isRecording ? 'animate-pulse bg-rose-600' : 'bg-rose-500/80'}`} aria-hidden="true">
                  {isRecording ? '■' : '●'}
                </span>
                <span className="mt-4 text-lg font-semibold">{isRecording ? `Stop recording · ${formatTime(recordingSeconds)}` : isStartingRecording ? 'Requesting microphone…' : 'Record a new lead take'}</span>
                <span className="mt-2 text-sm text-slate-400">{isRecording ? 'Select stop when your take is complete' : 'Uses your device microphone; browser permission required'}</span>
              </button>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{audioFile.name}</p>
                  <p className="mt-1 text-sm text-slate-400">{(audioFile.size / (1024 * 1024)).toFixed(1)} MB · {duration ? formatTime(duration) : 'Reading audio duration…'}</p>
                </div>
                <button type="button" onClick={playAudio} className="rounded-full bg-brand-500 px-6 py-2.5 font-semibold text-white hover:bg-brand-400">{isPlaying ? 'Pause live preview' : 'Play live effects preview'}</button>
              </div>
              <audio
                ref={audioRef}
                src={audioUrl}
                controls
                preload="metadata"
                className="mt-5 w-full"
                onLoadedMetadata={(event) => {
                  if (event.currentTarget.currentSrc !== audioUrl) return;
                  const loadedDuration = event.currentTarget.duration;
                  if (Number.isFinite(loadedDuration) && loadedDuration > 0) setDuration(loadedDuration);
                  else setMessage('The recording has no readable duration. Please record again or import a supported audio file.');
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => {
                  setIsPlaying(false);
                  livePreviewRef.current?.graph.setEnabled(false);
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  livePreviewRef.current?.graph.setEnabled(false);
                  if (isRecording && recordingTargetRef.current) stopRecording();
                }}
                onError={() => {
                  setIsPlaying(false);
                  if (audioRef.current?.currentSrc === audioUrl) setDuration(null);
                  setMessage('This audio could not be decoded by your browser. Please record again or import WAV, MP3, FLAC, or M4A audio.');
                }}
              />
            </div>
          )}

          {audioFile && (
            <section className="mt-5 rounded-2xl border border-brand-500/30 bg-brand-500/5 p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h3 className="font-semibold text-white">Record the lead in parts</h3>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                    Record your first verse as the lead, then add each later verse separately. New parts are appended after the current vocal; adjust their start time below if you want a break.
                  </p>
                </div>
                {!isRecording && (
                  <button
                    type="button"
                    onClick={() => requestRecording({
                      id: 'lead-segment',
                      label: `lead part ${leadSegments.length + 2}`,
                      offset: nextLeadSegmentOffset,
                    })}
                    disabled={isStartingRecording || !duration}
                    className="shrink-0 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isStartingRecording ? 'Requesting microphone…' : `Record next part · ${formatTimelineTime(nextLeadSegmentOffset)}`}
                  </button>
                )}
              </div>
              {leadSegments.length > 0 && (
                <div className="mt-4 space-y-3">
                  {leadSegments.map((segment, index) => (
                    <article key={segment.id} className="rounded-xl border border-slate-700 bg-slate-950/80 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-white">Lead part {index + 2} · {formatTime(segment.duration)}</p>
                          <p className="truncate text-xs text-slate-500">{segment.file.name}</p>
                        </div>
                        <button type="button" onClick={() => removeLeadSegment(segment.id)} disabled={isRecording || isStartingRecording} className="rounded-full border border-rose-400/30 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10 disabled:opacity-40">
                          Remove part
                        </button>
                      </div>
                      <audio src={segment.url} controls preload="metadata" className="mt-3 w-full" aria-label={`Listen to lead part ${index + 2}`} />
                      <label className="mt-3 block text-xs text-slate-400">
                        <span className="mb-2 flex justify-between">
                          <span>Start in the combined mix</span>
                          <span>{formatTimelineTime(segment.offset)}</span>
                        </span>
                        <input
                          type="range"
                          min="0"
                          max={Math.max(30, Math.ceil(segment.offset + 30))}
                          step="0.1"
                          value={segment.offset}
                          onChange={(event) => updateLeadSegment(segment.id, { offset: Number(event.target.value) })}
                          disabled={isRecording || isStartingRecording}
                          className="w-full accent-brand-400"
                        />
                      </label>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {previousLeadTakes.length > 0 && (
            <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <h3 className="font-semibold text-white">Previous lead takes · {previousLeadTakes.length}</h3>
              <p className="mt-1 text-sm text-slate-400">Recording or importing a new lead saves the current take here. Restore any version without losing the active one.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {previousLeadTakes.map((take) => (
                  <button key={take.id} type="button" onClick={() => activatePreviousLeadTake(take)} className="max-w-full truncate rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-brand-400" title={take.file.name}>
                    Restore: {take.file.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/70 p-5 md:p-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-brand-300">Vocal layers</p>
                <h2 className="mt-2 text-xl font-bold">Add supporting harmony</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  Record or import harmony as a separate track; it never replaces your lead or another layer. Use headphones and keep takes aligned to the same start point. Set a track&apos;s start offset below if it begins later, and blend it beneath the lead.
                </p>
              </div>
              {isRecording && !recordingTargetRef.current ? (
                <span className="rounded-full bg-rose-500/10 px-4 py-2 text-sm text-rose-200">Recording lead vocal · {formatTime(recordingSeconds)}</span>
              ) : null}
            </div>

            {!audioFile && <p className="mt-5 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-400">You can record or import harmony takes now. Add a lead vocal before previewing or exporting the combined mix.</p>}

            <div className="mt-5 rounded-2xl border border-brand-500/30 bg-brand-500/5 p-5">
              <h3 className="font-semibold text-white">Generate harmony from the lead</h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
                The browser estimates the key from sung notes, smooths note changes, then makes separate harmony tracks. A close third below and above are selected by default; add fifths for a fuller arrangement. Generated tracks are pitch-shifted versions of the lead, so listen and adjust their levels.
              </p>
              {harmonyDetection && (
                <p className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm text-brand-200">
                  Auto-estimated: {harmonyDetection.key} {harmonyDetection.scale}
                  {harmonyDetection.usedKey !== harmonyDetection.key || harmonyDetection.usedScale !== harmonyDetection.scale
                    ? ` · using ${harmonyDetection.usedKey} ${harmonyDetection.usedScale}`
                    : ' · automatic'}
                  <span className="ml-2 text-slate-400">Use as a guide and confirm by ear.</span>
                </p>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-300">
                  <span className="mb-1 block">Key</span>
                  <select value={harmonyKey} onChange={(event) => setHarmonyKey(event.target.value)} disabled={isGeneratingHarmony} className="w-full rounded-xl border-slate-700 bg-slate-950 text-white focus:border-brand-400 focus:ring-brand-400">
                    <option value="auto">Auto-detect from lead</option>
                    {pitchClasses.map((pitchClass) => <option key={pitchClass} value={pitchClass}>{pitchClass}</option>)}
                  </select>
                </label>
                <label className="text-sm text-slate-300">
                  <span className="mb-1 block">Scale</span>
                  <select value={harmonyScale} onChange={(event) => setHarmonyScale(event.target.value)} disabled={isGeneratingHarmony} className="w-full rounded-xl border-slate-700 bg-slate-950 text-white focus:border-brand-400 focus:ring-brand-400">
                    <option value="auto">Auto-detect major/minor</option>
                    <option value="major">Major</option>
                    <option value="minor">Natural minor</option>
                  </select>
                </label>
              </div>
              <fieldset className="mt-4">
                <legend className="text-sm font-medium text-slate-300">Harmony parts</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {[
                    ['third-below', '3rd below'],
                    ['fifth-below', '5th below'],
                    ['third-above', '3rd above'],
                    ['fifth-above', '5th above'],
                  ].map(([interval, label]) => (
                    <label key={interval} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={harmonyIntervals.includes(interval)}
                        onChange={() => setHarmonyIntervals((current) => current.includes(interval)
                          ? current.filter((item) => item !== interval)
                          : [...current, interval])}
                        disabled={isGeneratingHarmony}
                        className="rounded border-slate-600 bg-slate-900 text-brand-500 focus:ring-brand-400"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="button" onClick={createHarmonyLayer} disabled={!audioFile || isGeneratingHarmony || isRecording} className="mt-4 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40">
                {isGeneratingHarmony ? harmonyProgress || 'Generating harmonies…' : 'Generate selected harmonies'}
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {backgroundRoles.map((role) => {
                const activeRole = isRecording && recordingTargetRef.current?.id === role.id;
                return (
                  <article key={role.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-100">{role.label}</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-400">{role.suggestion}</p>
                      </div>
                      {activeRole && <span className="shrink-0 rounded-full bg-rose-500/15 px-2.5 py-1 text-xs text-rose-200">Recording</span>}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {activeRole ? (
                        <button type="button" onClick={stopRecording} className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500">Stop harmony take · {formatTime(recordingSeconds)}</button>
                      ) : (
                        <>
                          <button type="button" onClick={() => requestRecording(role)} disabled={isRecording || isStartingRecording} className="rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40">{isStartingRecording && recordingTargetRef.current?.id === role.id ? 'Requesting mic…' : 'Record this part'}</button>
                          <button type="button" onClick={() => openLayerPicker(role)} disabled={isRecording || isStartingRecording} className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40">Import take</button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {visibleBackgroundLayers.length > 0 && (
              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">Harmony tracks · {visibleBackgroundLayers.length}</h3>
                {visibleBackgroundLayers.map((layer) => (
                  <article key={layer.id} className={`rounded-xl border p-4 ${layer.muted ? 'border-slate-800 bg-slate-950/50 opacity-60' : 'border-brand-500/30 bg-slate-900'}`}>
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                      <div className="min-w-0">
                        <p className="font-semibold text-white">{layer.name}</p>
                        <p className="truncate text-xs text-slate-500">{layer.file.name}</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => updateLayer(layer.id, { muted: !layer.muted })} aria-pressed={layer.muted} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500">{layer.muted ? 'Unmute' : 'Mute'}</button>
                        <button type="button" onClick={() => removeLayer(layer.id)} className="rounded-full border border-rose-400/30 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10">Remove</button>
                      </div>
                    </div>
                    <audio src={layer.url} controls preload="metadata" className="mt-3 w-full" aria-label={`Listen to ${layer.name}`} />
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <label className="text-xs text-slate-400">
                        <span className="mb-2 flex justify-between"><span>Layer level</span><span>{layer.volume}%</span></span>
                        <input type="range" min="0" max="150" value={layer.volume} onChange={(event) => updateLayer(layer.id, { volume: Number(event.target.value) })} className="w-full accent-brand-400" />
                      </label>
                      <label className="text-xs text-slate-400">
                        <span className="mb-2 flex justify-between"><span>Pan</span><span>{layer.pan < 0 ? `L ${Math.abs(layer.pan)}` : layer.pan > 0 ? `R ${layer.pan}` : 'Center'}</span></span>
                        <input type="range" min="-100" max="100" value={layer.pan} onChange={(event) => updateLayer(layer.id, { pan: Number(event.target.value) })} className="w-full accent-brand-400" />
                      </label>
                      <label className="text-xs text-slate-400">
                        <span className="mb-2 flex justify-between">
                          <span>Track start offset from lead start</span>
                          <span>{Number(layer.offset).toFixed(1)}s</span>
                        </span>
                        <input type="range" min="0" max="30" step="0.1" value={layer.offset} onChange={(event) => updateLayer(layer.id, { offset: Number(event.target.value) })} className="w-full accent-brand-400" />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-brand-300">Vocal controls</p>
                  <h2 className="mt-2 text-xl font-bold">Shape your mix</h2>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  {audioFile && (
                    <button type="button" onClick={playAudio} className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-400">
                      {isPlaying ? 'Pause live preview' : 'Play live preview'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSettings(initialSettings);
                      livePreviewRef.current?.graph.update(initialSettings);
                      setSelectedPreset('');
                    }}
                    className="text-sm text-slate-400 underline hover:text-white"
                  >
                    Reset controls
                  </button>
                </div>
              </div>
              <div className="mt-5 space-y-5">
                <p className="text-sm leading-6 text-slate-400">
                  Start live preview once, then adjust effects or choose presets while the audio keeps playing.
                </p>
                <p className="text-xs leading-5 text-slate-500">
                  Vocal boost is capped at +12 dB (about 4× signal level) and feeds the compressor. Boosting also raises noise already in the recording; for the cleanest result, use a healthy original recording and increase gradually.
                </p>
                <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <label className="flex items-center justify-between gap-4">
                    <span>
                          <span className="block font-medium text-slate-100">Noise gate (off by default)</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-400">Gently lowers room noise between phrases. It does not remove noise under the voice, and a high threshold can trim quiet words.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.noiseGate}
                      onChange={(event) => {
                        const nextSettings = { ...settings, noiseGate: event.target.checked };
                        setSettings(nextSettings);
                        livePreviewRef.current?.graph.update(nextSettings);
                        setSelectedPreset('');
                      }}
                      className="h-4 w-4 accent-brand-400"
                    />
                  </label>
                  {settings.noiseGate && (
                    <label className="mt-4 block text-sm">
                      <span className="mb-2 flex items-center justify-between">
                        <span className="font-medium text-slate-100">Gate threshold</span>
                        <span className="tabular-nums text-slate-300">{settings.noiseGateThresholdDb} dB</span>
                      </span>
                      <input
                        type="range"
                        min="-70"
                        max="-30"
                        step="1"
                        value={settings.noiseGateThresholdDb}
                        onChange={(event) => updateSetting('noiseGateThresholdDb', event.target.value)}
                        className="h-2 w-full cursor-pointer accent-brand-400"
                      />
                      <span className="mt-1 block text-xs text-slate-500">Raise the threshold to suppress more background noise; too high can cut quiet words.</span>
                    </label>
                  )}
                </section>
                <label className="block text-sm">
                  <span className="mb-2 block">
                    <span className="font-medium text-slate-100">Delay type</span>
                    <span className="ml-2 text-xs text-slate-500">Pick a starting style, then shape the repeats</span>
                  </span>
                  <select
                    value={settings.delayMode}
                    onChange={(event) => {
                      const mode = event.target.value;
                      const nextSettings = {
                        ...settings,
                        delayMode: mode,
                        delayTimeMs: mode === 'short'
                          ? 240
                          : mode === 'long'
                            ? 520
                            : mode === 'pingpong'
                              ? 240
                              : settings.delayTimeMs,
                      };
                      setSettings(nextSettings);
                      livePreviewRef.current?.graph.update(nextSettings);
                      setSelectedPreset('');
                    }}
                    className="w-full rounded-xl border-slate-700 bg-slate-950 text-white focus:border-brand-400 focus:ring-brand-400"
                  >
                    <option value="off">Off</option>
                    <option value="short">Short echo · 240 ms starting point</option>
                    <option value="long">Long echo · 520 ms starting point</option>
                    <option value="pingpong">Ping-pong · first echo left, then right at 240 ms</option>
                  </select>
                </label>
                {controls.map((control) => (
                  <label key={control.key} className="block">
                    <span className="mb-2 flex items-center justify-between text-sm">
                      <span><span className="font-medium text-slate-100">{control.label}</span><span className="ml-2 text-xs text-slate-500">{control.detail}</span></span>
                      <span className="tabular-nums text-slate-300">
                        {control.key === 'vocalGainDb'
                          ? `${settings.vocalGainDb.toFixed(1)} dB (${(10 ** (settings.vocalGainDb / 20)).toFixed(1)}×)`
                          : `${settings[control.key]}${control.key === 'delayTimeMs' ? ' ms' : '%'}`}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={control.key === 'delayTimeMs' ? 80 : control.key === 'vocalGainDb' ? 0 : 0}
                      max={control.key === 'delayTimeMs' ? 2000 : control.key === 'delayFeedback' ? 85 : control.key === 'vocalGainDb' ? 12 : 100}
                      step={control.key === 'delayTimeMs' ? 10 : control.key === 'vocalGainDb' ? 0.5 : 1}
                      value={settings[control.key]}
                      onChange={(event) => updateSetting(control.key, event.target.value)}
                      className="h-2 w-full cursor-pointer accent-brand-400"
                    />
                  </label>
                ))}
              </div>
              <button type="button" onClick={exportMix} disabled={isExporting || !audioFile} className="mt-7 w-full rounded-full bg-brand-500 px-6 py-3 font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40">
                {isExporting ? 'Rendering mix…' : 'Export processed WAV'}
              </button>
            </div>

            <div id="presets" className="scroll-mt-6">
              <p className="text-xs uppercase tracking-[0.25em] text-brand-300">Starting points</p>
              <h2 className="mt-2 text-xl font-bold">Choose a vocal profile</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">Presets set the controls above. Choose one, preview it, then refine to fit your own recording.</p>
              <div className="mt-5 grid gap-3">
                {presets.map((preset) => (
                  <button key={preset.name} type="button" onClick={() => applyPreset(preset)} aria-pressed={selectedPreset === preset.name} className={`rounded-2xl border p-4 text-left transition ${selectedPreset === preset.name ? 'border-brand-400 bg-brand-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}>
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-white">{preset.name}</span>
                      <span className={`text-xs ${selectedPreset === preset.name ? 'text-brand-200' : 'text-slate-500'}`}>{selectedPreset === preset.name ? 'Applied' : 'Apply'}</span>
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-slate-400">{preset.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
