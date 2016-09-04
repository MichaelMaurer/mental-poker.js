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
  cardsOfCommunity: Card[] = [];

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

  makeCardUnpickable(index: number): Game {
    return new Game({
      ...this,
      unpickableCardIndexes: [
        ...this.unpickableCardIndexes,
        index,
      ],
    });
  }

  // TODO: Docs for secretsOfOpponents (3 times)
  /**
   * Picks an unowned card at the given index, unlocking it by its corresponding
   * secrets.
   * @param {number} index Index of the card to be opened.
   * @returns {Game} An instance of the opened card.
   */
  peekCard(index, secretsOfOpponents) {
    // Disallow peeking at unpickable cards
    // TODO: Throw an exception
    if (this.unpickableCardIndexes.indexOf(index)) return null;

    // Gather the secret of self at the given index
    const secretsOfPlayers = {
      ...secretsOfOpponents,
      [this.playerSelf.id]: this.playerSelf.secrets[index],
    };

    const currentDeck = this.deckSequence[this.deckSequence.length - 1];
    const pointUnlocked = currentDeck.unlockSingle(index, secrets);
    const initialDeckPoints = this.deckSequence[0].points;

    for (let i = initialDeckPoints.length - 1; i >= 0; --i) {
      if (initialDeckPoints[i].eq(pointUnlocked)) {
        // Make the unlocked card unpickable if necessary
        if (isMadeUnpickable) {
          this.unpickableCardIndexes.push(index);
        }

        return new Card(i);
      }
    }
  }

  /**
   * Picks an unowned card at the given index, and then draws it to the hand of
   * self.
   * @param {number} index Index of the card to be drawn.
   * @returns {Game} A new Game instance with an updated list of players and
   * their cards.
   */
  drawCard(index, secretsOfOpponents) {
    const card = this.peekCard(index, secretsOfOpponents);
    if (!card) return null;

    return new Game({
      ...this,
      players: this.players.map((player: Player): Player =>
        player.addSecret(index, secretsOfOpponents[player.id])
      ),
      playerSelf: new Player({
        ...this.playerSelf,
        cardsInHand: [
          ...this.playerSelf.cardsInHand,
          card,
        ],
      }),
    });
  }

  /**
   * Picks an unowned card at the given index, and then opens it as a community
   * card.
   * @param {number} index Index of the card to be opened.
   * @returns {Game} A new Game instance with an updated list of players and
   * community cards.
   */
  openCard(index, secretsOfOpponents) {
    const card = this.peekCard(index, secretsOfOpponents);
    if (!card) return null;

    return new Game({
      ...this,
      players: this.players.map((player: Player): Player =>
        player.addSecret(index, secretsOfOpponents[player.id])
      ),
      cardsOfCommunity: [
        ...this.cardsOfCommunity,
        card,
      ],
    });
  }

  disqualifyPlayer(id) {
    if (this.disqualifiedPlayerIds.indexOf(id)) return this;

    return new Game({
      ...this,
      disqualifiedPlayerIds: [
        ...this.disqualifiedPlayerIds,
        id,
      ]
    })
  }

  /**
   * Verifies the entire game, looking for players who were not playing fairly.
   * @returns {Game} A new Game instance with an updated list of disqualified
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
   * @returns {Game} A new Game instance with an updated list of winners.
   */
  evaluateHands(gameType: string = Config.gameType): Game {
    const pokerSolverGame = new PokerSolverGame(gameType);
    const commonCardStrings = this.cardsOfCommunity.map((card: Card): string =>
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
            ...player.cardsInHand.map((card: Card): string => card.toString()),
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
