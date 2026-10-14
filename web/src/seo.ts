import { useEffect } from 'react';

// Sets the page's title and description (for search results and link previews) while it's shown
export const usePageMeta = (title: string, description?: string) => {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = meta?.content;
    if (meta && description) meta.content = description;
    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== undefined) meta.content = previousDescription;
    };
  }, [title, description]);
};
