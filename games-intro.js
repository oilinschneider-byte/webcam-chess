/* The screen before every game (see faceToFace in solos.js): one super simple line at the top saying what you're trying
   to do, the game's name big in the middle, and the controls in big simple letters at the bottom.
   CA.gameIntro(id) → { goal, keys }. A game missing here uses the first sentence of its blurb, and no controls. */
(() => {
'use strict';

const INTRO = {
  // battles
  swords:   ['Hit the other cat with your sword', 'A D  move   ·   W  jump   ·   MOUSE  swing   ·   E  block   ·   SPACE  power up'],
  boxing:   ['Punch the targets faster than them', 'PUNCH  the targets   ·   CLICK  them (no camera)'],
  sumo:     ['Push the other cat out of the ring', 'W A S D  move   ·   SPACE  shove'],
  box:      ['Stay in the box alone the longest', 'W A S D  move   ·   SPACE  boomerang'],
  barrel:   ['Hit the other cat with the barrel', 'A D  move   ·   W  jump   ·   SPACE  pick up and throw'],
  cannons:  ['Blast the other cat with your cannon', 'MOUSE  aim   ·   HOLD CLICK  charge   ·   LET GO  fire'],
  walls:    ['Shoot the other cat', 'W A S D  move   ·   CLICK  shoot   ·   SPACE  build a wall'],
  potato:   ['Don\'t be holding it when it explodes', 'TYPE  the answer to throw it'],
  stare:    ['Don\'t blink first', 'LOOK  at your camera   ·   DON\'T BLINK'],
  poop:     ['Hit the other cat first', 'A D  move   ·   W  jump   ·   SPACE  shoot'],
  // races
  trails:   ['Don\'t crash into a trail or a wall', 'W A S D  or  ARROWS  steer'],
  kart:     ['Finish 3 laps first', 'W  go   ·   S  brake   ·   A D  steer   ·   SPACE  boost'],
  parkour:  ['Reach the golden flag first', 'A D  run   ·   W  jump   ·   SHIFT  dash'],
  gator:    ['Cat: swing across   ·   Gator: eat the cat', 'A D  move   ·   W  jump   ·   CLICK  grab / leap'],
  climb:    ['Climb to the top first', 'MOUSE  move your claw   ·   CLICK  grab'],
  dodge:    ['Dodge everything that falls', 'A D  run   ·   W  jump   ·   SPACE  grab'],
  hoops:    ['Score more baskets', 'A D  move   ·   HOLD W  shoot   ·   SPACE  quick shot'],
  hockey:   ['Score 5 goals first', 'MOUSE  move your paddle'],
  golf:     ['Get it in the hole in fewer shots', 'MOUSE  aim   ·   HOLD CLICK  charge   ·   LET GO  putt'],
  pond:     ['Catch more fish', 'CLICK  cast   ·   HOLD  when it bites   ·   E  throw a rock'],
  // grab it first
  cheese:   ['Get more cheese in your pot', 'A D  move   ·   W  jump   ·   HOLD CLICK  grab   ·   E  grab the cat'],
  laser:    ['Keep your paw on the red dot', 'MOUSE  move your paw'],
  mouse:    ['Mouse: steal the cheese   ·   Cat: catch the mouse', 'W A S D  move   ·   SPACE  jump / dash   ·   E  squeak / trap'],
  paint:    ['Paint the most floor', 'W A S D  move   ·   HOLD CLICK  spray   ·   SPACE  bomb'],
  aim:      ['Click more targets', 'CLICK  the targets'],
  // brains and reflexes
  draw:     ['Guess what they draw', 'DRAW  with the mouse   ·   TYPE  your guess'],
  simon:    ['Only move when Simon says', 'COPY  the pose with your body'],
  claw:     ['Win more claws', 'PICK  rock, paper or scissors   ·   BET  1, 2 or 3'],
  yarn:     ['Follow your yarn to the end first', 'MOUSE  trace the yarn'],
  memory:   ['Find more pairs', 'CLICK  two cards'],
  sequence: ['Repeat the pattern', 'CLICK  the tiles in order'],
  speedchess: ['Take their king', 'CLICK  a piece, then where it goes'],
  chess:    ['Checkmate their king', 'CLICK  a piece, then where it goes'],
  scramble: ['Unscramble the word first', 'TYPE  the word'],
  type:     ['Type it faster', 'TYPE  the words'],
  // the rest of the mix
  timing:   ['Stop it on the gold line', 'CLICK  or  SPACE  to stop'],
  maze:     ['Get out of the maze first', 'W A S D  or  ARROWS  move'],
  stack:    ['Build the tallest tower', 'CLICK  or  SPACE  to drop'],
  snake:    ['Eat the most apples', 'W A S D  or  ARROWS  steer'],
  cups:     ['Find the ball', 'WATCH  the cup   ·   CLICK  it'],
  penalty:  ['Score more goals', 'SWIPE  to shoot and to dive'],
  rhyme:    ['Type the most rhymes', 'TYPE  rhyming words   ·   ENTER'],
  longword: ['Make the longest word', 'TYPE  a word   ·   ENTER'],
  category: ['Name the most things', 'TYPE  answers   ·   ENTER'],
  guess:    ['Guess what they picked', 'CLICK  your answer, then your guess'],
  wyr:      ['Guess what they\'d pick', 'CLICK  your answer, then your guess'],
  same:     ['Pick the same answer as them', 'CLICK  an answer'],
  pose:     ['Copy the pose first', 'COPY  the pose with your body'],
  hilo:     ['Guess higher or lower', 'CLICK  higher or lower'],
  closest:  ['Get closest to the answer', 'TYPE  a number'],
  shapes:   ['Name the country first', 'CLICK  the answer'],
  odd:      ['Find the one that doesn\'t belong', 'CLICK  the odd one out'],
  bigger:   ['Pick the bigger one first', 'CLICK  the answer'],
  timeline: ['Put them in order', 'CLICK  oldest to newest'],
  emoji:    ['Guess the movie first', 'CLICK  the answer'],
  animal:   ['Guess the animal first', 'CLICK  the answer'],
  pattern:  ['Find what comes next', 'CLICK  the answer'],
  flags:    ['Name the country first', 'CLICK  the answer'],
  geo:      ['Guess where it is', 'CLICK  the map   ·   LOCK IN'],
};

CA.gameIntro = function (id, blurb) {
  const x = INTRO[id];
  if (x) return { goal: x[0], keys: x[1] };
  const first = String(blurb || '').split(/(?<=[.!?])\s/)[0] || '';
  return { goal: first, keys: '' };
};

})();
