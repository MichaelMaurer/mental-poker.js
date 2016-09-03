import BigInt from 'bn.js';
import crypto from 'crypto';
import Config from './config';

export default class Secret extends BigInt {
  getHash(algorithm: string = Config.hashAlgorithm): string {
    return crypto.createHash(algorithm)
      .update(this.toString(16, 2))
      .digest('hex');
  }
}
