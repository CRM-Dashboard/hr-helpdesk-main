export interface CategoryItem {
  mandt: string;
  category: string;
  subCategory: string;
  spocId: string;
  tat1: string;
  esc1: string;
  tat2: string;
  esc2: string;
  tat3: string;
  esc3: string;
}

export interface HRCategories {
  HRCategory: CategoryItem[];
}
export interface Categories {
  Category: CategoryItem[];
}
