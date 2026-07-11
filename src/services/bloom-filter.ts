class BloomFilter {
  private bitArray: Uint32Array;
  private readonly hashCount: number;
  private readonly size: number;

  constructor(size: number) {
    this.size = size;
    this.hashCount = Math.round(Math.log(2) * (size / 100));
    this.bitArray = new Uint32Array(Math.ceil(size / 32));
  }

  private getIndex(value: string, seed: number): number {
    const hash = this.hash(value, seed);
    return (hash * this.size) >>> 0;
  }

  private hash(value: string, seed: number): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i) + (seed << i);
    }
    return hash >>> 0;
  }

  add(value: string): void {
    for (let i = 0; i < this.hashCount; i++) {
      const index = this.getIndex(value, i);
      const wordIndex = Math.floor(index / 32);
      const bitIndex = index % 32;
      this.bitArray[wordIndex] |= 1 << bitIndex;
    }
  }

  has(value: string): boolean {
    for (let i = 0; i < this.hashCount; i++) {
      const index = this.getIndex(value, i);
      const wordIndex = Math.floor(index / 32);
      const bitIndex = index % 32;
      if (this.bitArray[wordIndex] & (1 << bitIndex)) {
        continue;
      }
      return false;
    }
    return true;
  }
}

export { BloomFilter };
