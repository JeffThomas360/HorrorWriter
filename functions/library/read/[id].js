export async function onRequest(context) {
  const { request, env, params, next } = context;
  const url = new URL(request.url);
  const storyId = params.id;

  // 1. Fetch the original index.html
  const response = await next();

  // 2. We only intercept HTML responses
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("text/html")) {
    return response;
  }

  // 3. Fetch story metadata from Supabase
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // If env vars are missing, just return the normal HTML
    return response;
  }

  try {
    const bookRes = await fetch(`${supabaseUrl}/rest/v1/books?id=eq.${storyId}&select=title,lede`, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });

    if (!bookRes.ok) return response;
    
    const books = await bookRes.json();
    if (!books || books.length === 0) return response;

    const book = books[0];
    const newTitle = `${book.title} | Horror Writer`;
    const newDesc = book.lede || 'Read this chilling story on Horror Writer.';
    const newUrl = request.url;

    // 4. Use HTMLRewriter to inject the new meta tags
    return new HTMLRewriter()
      .on('title', {
        element(element) {
          element.setInnerContent(newTitle);
        }
      })
      .on('meta[property="og:title"]', {
        element(element) {
          element.setAttribute('content', newTitle);
        }
      })
      .on('meta[name="twitter:title"]', {
        element(element) {
          element.setAttribute('content', newTitle);
        }
      })
      .on('meta[property="og:description"]', {
        element(element) {
          element.setAttribute('content', newDesc);
        }
      })
      .on('meta[name="twitter:description"]', {
        element(element) {
          element.setAttribute('content', newDesc);
        }
      })
      .on('meta[property="og:url"]', {
        element(element) {
          element.setAttribute('content', newUrl);
        }
      })
      .transform(response);

  } catch (error) {
    // Fallback to normal response if anything fails
    return response;
  }
}
