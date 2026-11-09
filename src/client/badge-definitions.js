export const badgeRulesVersion = 1;
export const pokemonTotal = 1025;

export const badges = [
  {
    id: 'first-binder',
    name: 'First Binder',
    icon: '✦',
    description: 'Own 50 different card printings from at least 5 sets.',
    targets: [
      [50, 'printings'],
      [5, 'sets'],
    ],
  },
  {
    id: 'century-club',
    name: 'Century Club',
    icon: '◈',
    description: 'Own a card for 100 different Pokémon species.',
    targets: [[100, 'species']],
  },
  {
    id: 'evolution-expert',
    name: 'Evolution Expert',
    icon: '↗',
    description: 'Complete 5 three-stage evolution lines from different families.',
    targets: [[5, 'families']],
  },
  {
    id: 'starter-master',
    name: 'Starter Master',
    icon: '✧',
    description: 'Complete all three starter evolution lines from one region.',
    targets: [[3, 'starter lines in one region']],
  },
  {
    id: 'species-specialist',
    name: 'Species Specialist',
    icon: '◎',
    description: 'Own 10 printings of one species across at least 4 sets.',
    targets: [
      [10, 'printings'],
      [4, 'sets'],
    ],
  },
  {
    id: 'across-languages',
    name: 'Across Languages',
    icon: '↔',
    description: 'Own an English card and a Japanese card for each of 25 species.',
    targets: [[25, 'species in both languages']],
  },
  {
    id: 'goal-complete',
    name: 'Goal Complete',
    icon: '✓',
    description: 'Own every selected finish in a collection goal with at least 25 printings.',
    targets: [[1, 'completed goal']],
  },
  {
    id: 'pokedex-veteran',
    name: 'Pokédex Veteran',
    icon: '◆',
    description: 'Own a card for 500 different Pokémon species.',
    targets: [[500, 'species']],
  },
  {
    id: 'generation-master',
    name: 'Generation Master',
    icon: '✪',
    description: 'Own a card for every species introduced in two generations.',
    targets: [[2, 'generations']],
  },
  {
    id: 'pokedex-complete',
    name: 'Pokédex Complete',
    icon: '★',
    description: 'Own a card for every species in the app’s Pokédex.',
    targets: [[pokemonTotal, 'species']],
  },
];
