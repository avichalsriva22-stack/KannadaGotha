class PcmWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(4096);
    this._offset = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0]) {
      return true;
    }

    const channel = input[0];
    if (output && output[0]) {
      output[0].set(channel);
    }

    let i = 0;
    while (i < channel.length) {
      const take = Math.min(this._buffer.length - this._offset, channel.length - i);
      this._buffer.set(channel.subarray(i, i + take), this._offset);
      this._offset += take;
      i += take;
      if (this._offset === this._buffer.length) {
        this.port.postMessage(this._buffer.slice());
        this._offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-worklet', PcmWorkletProcessor);
