import Config from './config';
import Secret from './secret';
import * as Utils from './utils';
import type { Point } from './interfaces';

/**
 * An immutable object which represents a deck of cards.
 * @class Deck
 */
export default class Deck {
  /**
   * Points of the deck.
   */
  points: Point[];

  /**
   * @param {Point[]} points Points of the deck.
   */
  constructor(points: Point[]) {
    this.points = points;
  }

  /**
   * Encrypts all of the deck's points with the given secret.
   * @param {Secret} secret Secret to encrypt with.
   * @returns {Deck}
   */
  encrypt(secret: Secret): Deck {
    const bi = secret.fromRed();
    return new Deck(this.points.map((point: Point): Point => point.mul(bi)));
  }

  /**
   * Decrypts all of the deck's points with the given secret.
   * @param {Secret} secret Secret to be used for decryption.
   * @returns {Deck}
   */
  decrypt(secret: Secret): Deck {
    const bi = secret.invm(Config.ec.n);
    return new Deck(this.points.map((point: Point): Point => point.mul(bi)));
  }

  /**
   * Shuffles all of the deck's points.
   * @returns {Deck}
   */
  shuffle(): Deck {
    return new Deck(Utils.shuffleArray(this.points));
  }

  /**
   * Locks all of the deck's points with the given secrets.
   * @param {Secret[]} secrets Secrets to lock with.
   * @returns {Deck}
   */
  lock(secrets: Secret[]): Deck {
    return new Deck(
      this.points.map((point: Point, i: number): Point =>
        point.mul(secrets[i].fromRed())
      )
    );
  }

  /**
   * Unlocks a single point by using multiple secrets.
   * @param {number} index Index of the card to be unlocked.
   * @param {Secret[]} secrets Secrets to be used for unlocking.
   * @returns {Point}
   */
  unlockSingle(index: number, secrets: Secret[]): Point {
    let point = this.points[index];

    for (const secret of secrets) {
      point = point.mul(secret.invm(Config.ec.n));
    }

    return point;
  }
}
