import { Readable } from 'stream';

// create an readable stream
export default class HunkStream extends Readable {
  constructor(private content: String) {
    super()
  }

  _read() {
    const ctx = this;
    ctx.push(this.content)
    ctx.push(null)
  }

  toString() {
    return this.content
  }
}
