// Court coordinates use a 300 x 250 half-court drawing (6px per foot, hoop at 150,41.5).
// `reviewed: false` marks coaching copy that still needs sign-off from the trainer.
const FIVE_MID = [
  { name: 'Left baseline', x: 55, y: 48 },
  { name: 'Left elbow', x: 96, y: 122 },
  { name: 'Free throw line', x: 150, y: 132 },
  { name: 'Right elbow', x: 204, y: 122 },
  { name: 'Right baseline', x: 245, y: 48 },
];
const FIVE_THREE = [
  { name: 'Left corner', x: 9, y: 52 },
  { name: 'Left wing', x: 40, y: 152 },
  { name: 'Top of the key', x: 150, y: 196 },
  { name: 'Right wing', x: 260, y: 152 },
  { name: 'Right corner', x: 291, y: 52 },
];

export const DRILLS = [
  {
    id: 'form-shooting',
    title: 'Form Shooting',
    category: 'Mechanics',
    description: 'Close-range reps that groove one repeatable release.',
    youtubeId: 'FBcm0NE2hzU',
    targetAttempts: 25,
    pro: false,
    perSpot: 25,
    spots: [{ name: 'Two feet from the rim', x: 150, y: 62 }],
    reviewed: true,
    coaching: {
      Setup: [
        'Feet shoulder-width, shooting foot ahead',
        'Knees bent, core locked tight',
        'Eyes glued to the back rim',
        'Elbow under ball, guide hand silent',
        'Start two feet from rim',
      ],
      Execution: [
        'Legs first, then arm — fluid',
        'Snap wrist, hold the gooseneck',
        'Same rhythm, every single rep',
        '8–10 perfect makes per spot',
        'Step back only after mastery',
      ],
      'The Adjustment': [
        'Short? Drive through your legs harder',
        'Long? Soften wrist, arc it higher',
        'Left/Right? Square hips to rim',
        'Feels good, still missing? Check elbow alignment',
        'One bad rep = reset stance',
      ],
    },
  },
  {
    id: 'spot-up-5',
    title: '5-Spot Mid-Range',
    category: 'Spot shooting',
    description: 'Ten shots from each of five mid-range spots.',
    youtubeId: 'T7gByxOk5Hg',
    targetAttempts: 50,
    pro: false,
    perSpot: 10,
    spots: FIVE_MID,
    reviewed: false,
    coaching: {
      Setup: [
        'Five spots: baseline, elbow, top, elbow, baseline',
        'Ten shots per spot, then rotate',
        'Start every rep in a loaded stance',
        'Shooting hand ready before the catch',
        'Pick your rim target early',
      ],
      Execution: [
        'Catch, one-two step, rise straight up',
        'Release at the top of your jump',
        'Land where you took off',
        'Hold the follow-through until it lands',
        'Jog to the next spot, reset',
      ],
      'The Adjustment': [
        'Short? Rise higher, legs before arm',
        'Long? Shoot up, not out',
        'Left/Right? Point lead toe at rim',
        'Drifting sideways? Narrow base, land balanced',
        'Baseline misses? Aim over the front rim',
      ],
    },
  },
  {
    id: 'elite-3pt-flow',
    title: 'Elite 3PT Flow State',
    category: 'Pro Series · Range',
    description: 'Fifteen threes from each of five spots around the arc.',
    youtubeId: 'S7-1NSjJzn0',
    targetAttempts: 75,
    pro: true,
    perSpot: 15,
    spots: FIVE_THREE,
    reviewed: false,
    coaching: {
      Setup: [
        'Five spots: corner, wing, top, wing, corner',
        'Fifteen shots per spot, then rotate',
        'Toes behind the line, every rep',
        'Dip the ball, load your hips',
        'Eyes on the rim early',
      ],
      Execution: [
        'One motion: dip, rise, release',
        'Power comes from legs, not shoulders',
        'Same release point as your mid-range',
        'Hold the finish, watch it drop',
        'Walk it off, breathe, next rep',
      ],
      'The Adjustment': [
        'Short? Deeper dip, faster legs',
        'Long? Higher arc, softer wrist',
        'Left/Right? Check feet and shoulders square',
        'Flat shot? Finish elbow above eye',
        'Arms tired? Slow down, protect form',
      ],
    },
  },
];

export const drillById = (id) => DRILLS.find((drill) => drill.id === id) || null;
