// Seeded LCG pseudo-random number generator.
// Use this everywhere in src/sim/ instead of Math.random().
// Same seed + same sequence of calls = same results every time.

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  // Returns a float in [0, 1)
  next(): number {
    // Numerical Recipes LCG constants
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  // Returns an integer in [min, max] inclusive
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}
