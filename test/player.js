import test from 'ava';
import * as Config from './../src/config';
import Player from './../src/player';

test('constructor without params', (t) => {
  const player = new Player();

  t.is(player.points.length, Config.CARDS_IN_DECK);

  t.is(player.secrets.length, Config.CARDS_IN_DECK + 1);
  for (const secret of player.secrets) {
    t.true(secret.gten(1));
    t.true(secret.lt(Config.EC.n));
  }
});