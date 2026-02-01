/**
 * Web Search Utility for Question Generation
 * 
 * Integrates real-time news and current events into question generation
 * to make questions more relevant and grounded in reality.
 * 
 * Supports multiple search providers:
 * - Tavily API (recommended for AI applications)
 * - Serper API (Google Search results)
 * - DuckDuckGo (fallback, no API key needed)
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  source?: string;
}

export interface SearchContext {
  query: string;
  results: WebSearchResult[];
  timestamp: number;
}

// Check if web search is configured
export function isWebSearchConfigured(): boolean {
  return !!(process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY);
}

/**
 * Search for current events and news related to a topic
 */
export async function searchCurrentEvents(
  topic: string,
  maxResults: number = 3
): Promise<WebSearchResult[]> {
  // Try Tavily first (best for AI applications)
  if (process.env.TAVILY_API_KEY) {
    return searchWithTavily(topic, maxResults);
  }
  
  // Fall back to Serper (Google results)
  if (process.env.SERPER_API_KEY) {
    return searchWithSerper(topic, maxResults);
  }
  
  // No search API configured - return empty
  console.log('[WebSearch] No search API configured (set TAVILY_API_KEY or SERPER_API_KEY)');
  return [];
}

/**
 * Search using Tavily API
 */
async function searchWithTavily(query: string, maxResults: number): Promise<WebSearchResult[]> {
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: `${query} recent news 2025 2026`,
        search_depth: 'basic',
        include_domains: [],
        exclude_domains: [],
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`);
    }

    const data = await response.json();
    
    return (data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.content || '',
      publishedDate: r.published_date || undefined,
      source: new URL(r.url).hostname.replace('www.', ''),
    }));
  } catch (error) {
    console.error('[WebSearch] Tavily search failed:', error);
    return [];
  }
}

/**
 * Search using Serper API (Google Search)
 */
async function searchWithSerper(query: string, maxResults: number): Promise<WebSearchResult[]> {
  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: `${query} recent news`,
        num: maxResults,
        gl: 'us',
        hl: 'en',
      }),
    });

    if (!response.ok) {
      throw new Error(`Serper API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Combine organic results and news results
    const results: WebSearchResult[] = [];
    
    // Add news results first (more current)
    if (data.news) {
      for (const r of data.news.slice(0, Math.ceil(maxResults / 2))) {
        results.push({
          title: r.title || '',
          url: r.link || '',
          snippet: r.snippet || '',
          publishedDate: r.date || undefined,
          source: r.source || new URL(r.link).hostname.replace('www.', ''),
        });
      }
    }
    
    // Add organic results
    if (data.organic) {
      for (const r of data.organic.slice(0, maxResults - results.length)) {
        results.push({
          title: r.title || '',
          url: r.link || '',
          snippet: r.snippet || '',
          source: new URL(r.link).hostname.replace('www.', ''),
        });
      }
    }
    
    return results.slice(0, maxResults);
  } catch (error) {
    console.error('[WebSearch] Serper search failed:', error);
    return [];
  }
}

/**
 * Extract key topics from transcript for searching
 */
export function extractSearchTopics(transcript: string): string[] {
  // Extract key phrases/entities that would benefit from current context
  const topics: string[] = [];
  
  // Common patterns that indicate searchable topics
  const patterns = [
    /(?:discussing|about|regarding|concerning)\s+([A-Z][a-z]+(?:\s+[A-Za-z]+){0,3})/gi,
    /(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g, // Proper nouns
    /(?:impact|effect|implications)\s+of\s+([^,.]+)/gi,
    /(?:recent|latest|current)\s+([^,.]+)/gi,
  ];
  
  for (const pattern of patterns) {
    // Use Array.from to convert iterator to array for TypeScript compatibility
    const matches = Array.from(transcript.matchAll(pattern));
    for (const match of matches) {
      if (match[1] && match[1].length > 3 && match[1].length < 50) {
        topics.push(match[1].trim());
      }
    }
  }
  
  // Dedupe and limit
  return Array.from(new Set(topics)).slice(0, 3);
}

/**
 * Format search results for inclusion in question generation prompt
 */
export function formatSearchContext(results: WebSearchResult[]): string {
  if (results.length === 0) return '';
  
  let context = '\n\n--- CURRENT EVENTS & NEWS CONTEXT ---\n';
  context += 'Use these real-world developments to make questions more relevant and current:\n\n';
  
  for (const r of results) {
    context += `• ${r.title}\n`;
    context += `  "${r.snippet}"\n`;
    if (r.source) context += `  Source: ${r.source}`;
    if (r.publishedDate) context += ` (${r.publishedDate})`;
    context += '\n\n';
  }
  
  return context;
}
