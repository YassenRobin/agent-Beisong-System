export const ARTICLE_CATALOGS = [
  {
    id: 'compulsory_1',
    name: '必修上',
    description: '统编高中语文必修上册背诵篇目',
    expectedCount: 16,
  },
  {
    id: 'compulsory_2',
    name: '必修下',
    description: '统编高中语文必修下册背诵篇目',
    expectedCount: 8,
  },
  {
    id: 'selective_1',
    name: '选择性必修上',
    description: '统编高中语文选择性必修上册背诵篇目',
    expectedCount: 5,
  },
  {
    id: 'selective_2',
    name: '选择性必修中',
    description: '统编高中语文选择性必修中册背诵篇目',
    expectedCount: 7,
  },
  {
    id: 'selective_3',
    name: '选择性必修下',
    description: '统编高中语文选择性必修下册背诵篇目',
    expectedCount: 14,
  },
  {
    id: 'outside_textbook',
    name: '教材外篇目',
    description: '60篇自查表中列明的教材外背诵篇目',
    expectedCount: 10,
  },
  {
    id: 'optional_recitation',
    name: '选择背诵',
    description: '课程标准列明的12篇选择背诵篇目',
    expectedCount: 12,
  },
] as const;

export type ArticleCatalogId = (typeof ARTICLE_CATALOGS)[number]['id'];

export const ARTICLE_CATALOG_VERSION = '2026-08-72-v2';
