class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const inputData = input[0];
      
      // Convert Float32 to Int16 PCM Base64
      const pcm16 = new Int16Array(inputData.length);
      for(let i=0; i < inputData.length; i++) {
         pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
      }
      
      this.port.postMessage(pcm16.buffer);
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
