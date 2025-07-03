import { or, sql } from "drizzle-orm";

interface MultilingualText {
  [languageCode: string]: string;
}

export class TranslationUtils {
  static getTranslatedText(
    translations: MultilingualText | null | undefined,
    language: string,
    fallbackLanguage: string = 'en'
  ): string {
    if (!translations) {
      return '';
    }
    return (
      translations[language] ||
      translations[fallbackLanguage] ||
      Object.values(translations)[0] ||
      ''
    );
  }

  static createMultilingualSearchCondition(
    field: any,
    searchTerm: string,
    languages: string[] = ['en', 'ru']
  ) {
    const conditions = languages.map(
      (lang) => sql`${field}->>${lang} ILIKE ${`%${searchTerm}%`}`
    );
    return or(...conditions);
  }
}
