import { Game as PokerSolverGame, Hand as PokerSolverHand } from 'pokersolver';
import Card from './card';
import Config from './config';
import Deck from './deck';
import Player from './player';
import * as Utils from './utils';
import type { Point } from './interfaces';

export default class Game {
  cachedPlayerSelf;

  /**
   * Ordered list of players of the game.
   */
  players: Player[];

  /**
   * Keeps an ordered list of decks used throughout the game, allowing easy
   * verification at the end of the game.
   */
  deckSequence: Deck[];

  /**
   * Keeps an ordered list of unpickable (owned or opened) card indexes.
   */
  unpickableCardIndexes: number[] = [];

  /**
   * Keeps an ordered list of community cards.
   */
  cards: Card[] = [];

  /**
   * Keeps an ordered list of disqualified players.
   */
  disqualifiedPlayerIds: ?(string|number)[];

  /**
   * Keeps a list of winners of the game.
   */
  winnerPlayerIds: ?(string|number)[];

  /**
   * Player object of self.
   */
  get playerSelf(): Player {
    if (!this.cachedPlayerSelf) {
      for (const player of this.players) {
        if (player.isSelf) {
          this.cachedPlayerSelf = player;
          break;
        }
      }
    }

    return this.cachedPlayerSelf;
  }

  constructor(params: ?Object) {
    Object.assign(this, params);

    if (!this.deckSequence) {
      // Generate initial deck by combining the points of players
      let deckPoints = new Array(Config.cardsInDeck);
      for (const { points: playerPoints } of this.players) {
        if (playerPoints.length !== Config.cardsInDeck) {
          // TODO: Throw an exception
          deckPoints = Utils.getRandomPoints();
          break;
        }

        for (let i = playerPoints.length - 1; i >= 0; --i) {
          const playerPoint = playerPoints[i];
          const deckPoint = deckPoints[i];

          // Add the player's current point to the corresponding deck point
          deckPoints[i] = deckPoint ? deckPoint.add(playerPoint) : playerPoint;
        }
      }

      this.deckSequence = [new Deck(deckPoints)];
    }
  }

  /**
   * Returns all card indexes which are not yet owned or opened by anyone.
   * @returns {number[]}
   */
  getPickableCardIndexes(): number[] {
    const result = new Set(
      Array.from(
        new Array(Config.cardsInDeck),
        (v: null, i: number): number => i
      )
    );

    for (const cardIndex of this.unpickableCardIndexes) {
      result.delete(cardIndex);
    }

    return [...result];
  }

  /**
   * Returns a random pickable card index.
   * @returns {number}
   */
  getRandomPickableCardIndex(): number {
    const pickableCardIndexes = this.getPickableCardIndexes();

    // Return the index of a pickable card
    return pickableCardIndexes[
      Utils.getRandomInt(0, pickableCardIndexes.length)
    ];
  }

  /**
   * Adds a shuffled or locked deck to the game's deck sequence. Automatically
   * takes turn on behalf of the currently acting player, and updates game state
   * if necessary.
   * @param {Deck} deck Deck to be added to the game's deck sequence.
   * @returns {Game} A new `Game` instance with the given deck added to the deck
   * sequence.
   */
  addDeckToSequence(deck: Deck): Game {
    return new Game({
      ...this,
      deckSequence: [...this.deckSequence, deck],
    });
  }

  /**
   * Encrypts and then shuffles a deck.
   * @param {Player} [player] Player object to shuffle the deck with. Defaults
   * to the player object of self.
   * @param {Deck} [deck] Deck to be shuffled. If omitted, then uses the last
   * deck in the game's deck sequence.
   * @returns {Game} A new `Game` instance with the given deck added to the deck
   * sequence.
   */
  encryptAndShuffleDeck(
    player: Player = this.playerSelf,
    deck: Deck = this.deckSequence[this.deckSequence.length - 1]
  ): Game {
    // Improve the accessibility of secrets later by using the last one now
    const lastSecret = player.secrets[player.secrets.length - 1];

    // Shuffle the deck and then encrypt it to avoid data leaks
    const nextDeck = deck.encrypt(lastSecret).shuffle();
    return this.addDeckToSequence(nextDeck);
  }

  /**
   * Decrypts and then locks a deck.
   * @param {Player} [player] Player object to lock the deck with. Defaults to
   * the player object of self.
   * @param {Deck} [deck] Deck to be locked. If omitted, then uses the last deck
   * in the game's deck sequence.
   * @returns {Game} A new `Game` instance with the given deck added to the deck
   * sequence.
   */
  decryptAndLockDeck(
    player: Player = this.playerSelf,
    deck: Deck = this.deckSequence[this.deckSequence.length - 1]
  ): Game {
    const lastSecret = player.secrets[player.secrets.length - 1];

    // Remove the shuffle encryption and then lock each card one by one
    const nextDeck = deck.decrypt(lastSecret).lock(player.secrets);
    return this.addDeckToSequence(nextDeck);
  }

  makeCardUnpickable(index: number): Game {
    return new Game({
      ...this,
      unpickableCardIndexes: [...this.unpickableCardIndexes, index],
    });
  }

  /**
   * Picks an unowned card at the given index, unlocking it by its corresponding
   * secrets.
   * @param {number} index Index of the card to be opened.
   * @param {Object} secretsOfOpponents Secrets of opponents, as player IDs
   * mapped to secrets.
   * @returns {Card} An instance of the opened card.
   */
  peekCard(index: number, secretsOfOpponents: Object): Card {
    // Disallow peeking at unpickable cards
    // TODO: Throw an exception
    if (this.unpickableCardIndexes.indexOf(index)) return null;

    // TODO: Validate the secret of each opponent

    // Gather the secret of self at the given index
    const secrets = [
      ...Object.values(secretsOfOpponents),
      this.playerSelf.secrets[index],
    ];

    const currentDeck = this.deckSequence[this.deckSequence.length - 1];
    const pointUnlocked = currentDeck.unlockSingle(index, secrets);
    const initialDeckPoints = this.deckSequence[0].points;

    for (let i = initialDeckPoints.length - 1; i >= 0; --i) {
      if (initialDeckPoints[i].eq(pointUnlocked)) {
        return new Card(i);
      }
    }

    // TODO: Throw an exception
    return null;
  }

  /**
   * Picks an unowned card at the given index, and then draws it to the hand of
   * self.
   * @param {number} index Index of the card to be drawn.
   * @param {Object} secretsOfOpponents Secrets of opponents, as player IDs
   * mapped to secrets.
   * @returns {Game} A new `Game` instance with an updated list of players and
   * their cards.
   */
  drawCard(index: number, secretsOfOpponents: Object): Game {
    const card = this.peekCard(index, secretsOfOpponents);
    if (!card) return null;

    return new Game({
      ...this,
      players: this.players.map((player: Player): Player => (
        player.isSelf ?
          player.addCard(card) :
          player.addSecret(index, secretsOfOpponents[player.id])
      )),
    });
  }

  /**
   * Picks an unowned card at the given index, and then opens it as a community
   * card.
   * @param {number} index Index of the card to be opened.
   * @param {Object} secretsOfOpponents Secrets of opponents, as player IDs
   * mapped to secrets.
   * @returns {Game} A new `Game` instance with an updated list of players and
   * community cards.
   */
  openCard(index: number, secretsOfOpponents: Object): Game {
    const card = this.peekCard(index, secretsOfOpponents);
    if (!card) return null;

    return new Game({
      ...this,
      players: this.players.map((player: Player): Player => (
        player.isSelf ?
          player :
          player.addSecret(index, secretsOfOpponents[player.id])
      )),
      cards: [...this.cards, card],
    });
  }

  disqualifyPlayer(id: string|number): Game {
    if (this.disqualifiedPlayerIds.indexOf(id)) return this;

    return new Game({
      ...this,
      disqualifiedPlayerIds: [...this.disqualifiedPlayerIds, id],
    });
  }

  /**
   * Verifies the entire game, looking for players who were not playing fairly.
   * @returns {Game} A new `Game` instance with an updated list of disqualified
   * players.
   */
  verify(secretsOfOpponents): Game {
    // TODO
    const unfairPlayerIds = [];
    for (let i = this.players.length - 1; i >= 0; --i) {
      const player = this.players[i];

      if (
        // Check for deck shuffling mistakes
        !Utils.isArrayEqualWith(
          Utils.sortPoints(
            this.shuffleDeck(player, false, this.deckSequence[i]).points
          ),
          Utils.sortPoints(this.deckSequence[i + 1].points),
          (p1: Point, p2: Point): boolean => p1.eq(p2)
        ) ||

        // Check for deck locking mistakes
        !Utils.isArrayEqualWith(
          this.lockDeck(
            player,
            false,
            this.deckSequence[this.players.length + i]
          ).points,
          this.deckSequence[this.players.length + i + 1].points,
          (p1: Point, p2: Point): boolean => p1.eq(p2)
        )
      ) {
        unfairPlayerIds.push(player.id);
      }
    }

    return unfairPlayerIds;
  }

  /**
   * Evaluates the hands of players, looking for the winner(s) of the game.
   * @param {string} [gameType=Config.gameType] Type of the game to evaluate
   * hands for.
   * @returns {Game} A new `Game` instance with an updated list of winners.
   */
  evaluateHands(gameType: string = Config.gameType): Game {
    const pokerSolverGame = new PokerSolverGame(gameType);
    const commonCardStrings = this.cards.map((card: Card): string =>
      card.toString()
    );

    // Evaluate the hand of players who haven't folded
    const handsOfPlayers = new Map();
    for (const player of this.players) {
      // TODO: Add support for folding
      if (!player.hasFolded) {
        handsOfPlayers.set(
          PokerSolverHand.solve([
            ...commonCardStrings,
            ...player.cards.map((card: Card): string => card.toString()),
          ], pokerSolverGame),
          player
        );
      }
    }

    // Look for winner hands and map them to their owners
    return new Game({
      ...this,
      winnerPlayerIds: PokerSolverHand.winners([...handsOfPlayers.keys()])
        .map((hand: PokerSolverHand): string|number =>
          handsOfPlayers.get(hand).id
        ),
    });
  }
}
