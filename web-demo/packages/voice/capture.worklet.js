// 录音的 AudioWorklet（软件包 `voice`，`recorder.js` 照 `audioWorklet.addModule` 装进来）：把麦克风的第一个声道一块一块交回主线程
// （`port.postMessage`，Float32Array，交出去就不再用）。不降采样、不打包：那些在主线程做（`model.js`）。

class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length) {
      const copy = new Float32Array(channel);
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}

registerProcessor('miyu-voice-capture', Capture);
