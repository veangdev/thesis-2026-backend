/**
 * Cambodian name pools for the demo dataset.
 *
 * Khmer convention puts the **family name first**, then the given name — so
 * "Sok Dara" is Mr/Ms Sok, given name Dara. The seed composes names that way and
 * derives emails from `given.family`, which is how PNC issues addresses.
 *
 * Given names are split by gender because several are strongly gendered, and the
 * seeded `gender` column has to agree with the name for the roster filters to
 * look sane in a demo. A handful of genuinely unisex names (Chanthou, Sokha,
 * Samnang) are listed only once, under the gender they are more commonly used
 * for here, rather than duplicated across both pools.
 */

export const FAMILY_NAMES: readonly string[] = [
  'Sok',
  'Chan',
  'Kim',
  'Meas',
  'Pich',
  'Nou',
  'Long',
  'Vann',
  'Chea',
  'Kong',
  'Ouk',
  'Prak',
  'Sam',
  'Tep',
  'Thy',
  'Yun',
  'Heng',
  'Lim',
  'Mao',
  'Phan',
  'Sen',
  'Som',
  'Tith',
  'Vong',
  'Keo',
  'Ly',
  'Neth',
  'Rin',
  'Say',
  'Uy',
];

export const MALE_GIVEN_NAMES: readonly string[] = [
  'Dara',
  'Sovan',
  'Rithy',
  'Vichea',
  'Panha',
  'Bunthoeun',
  'Makara',
  'Visal',
  'Piseth',
  'Sopheak',
  'Rotha',
  'Kosal',
  'Narith',
  'Samnang',
  'Veasna',
  'Phearun',
  'Sereyvuth',
  'Bora',
  'Chamroeun',
  'Sothy',
  'Tharith',
  'Vibol',
  'Chhaya',
  'Nimol',
  'Ratana',
];

export const FEMALE_GIVEN_NAMES: readonly string[] = [
  'Sreypov',
  'Chanlina',
  'Sopheap',
  'Kunthea',
  'Malis',
  'Bopha',
  'Davy',
  'Leakhena',
  'Sokunthea',
  'Chantrea',
  'Nary',
  'Phalla',
  'Rachana',
  'Thida',
  'Vanna',
  'Sokna',
  'Mealea',
  'Nita',
  'Reaksmey',
  'Sovanna',
  'Theary',
  'Sina',
  'Chanthou',
  'Sokha',
  'Pisey',
];

/** Khmer provinces, for a plausible "home province" in facilitator bios. */
export const PROVINCES: readonly string[] = [
  'Phnom Penh',
  'Siem Reap',
  'Battambang',
  'Kampong Cham',
  'Kandal',
  'Takeo',
  'Kampot',
  'Prey Veng',
  'Banteay Meanchey',
  'Kampong Thom',
];
