export const PRESS_BEATS = [
  ['national-news', 'National news', ['national', 'nation', 'top stories'], ['national news', 'breaking']],
  ['politics', 'Politics', ['politics', 'elections', 'campaign'], ['election', 'candidate', 'campaign', 'party']],
  ['government', 'Government', ['government', 'city hall', 'county'], ['government', 'council', 'mayor', 'agency']],
  ['public-policy', 'Public policy', ['policy', 'legislation'], ['policy', 'bill', 'regulation', 'legislation']],
  ['business', 'Business', ['business', 'companies'], ['business', 'company', 'executive', 'industry']],
  ['finance', 'Finance', ['finance', 'markets', 'banking'], ['finance', 'bank', 'markets', 'investment']],
  ['economy', 'Economy', ['economy', 'economics'], ['economy', 'inflation', 'jobs', 'gdp']],
  ['technology', 'Technology', ['technology', 'tech'], ['technology', 'software', 'digital', 'computing']],
  ['ai', 'Artificial intelligence', ['ai', 'artificial intelligence'], ['artificial intelligence', 'machine learning', 'llm', 'ai']],
  ['cybersecurity', 'Cybersecurity', ['cybersecurity', 'security'], ['cybersecurity', 'breach', 'ransomware', 'privacy']],
  ['startups-vc', 'Startups and venture capital', ['startups', 'venture capital'], ['startup', 'venture', 'funding', 'founder']],
  ['science', 'Science', ['science', 'research'], ['science', 'research', 'study', 'laboratory']],
  ['health', 'Health', ['health', 'public health'], ['health', 'hospital', 'public health', 'wellness']],
  ['medicine', 'Medicine', ['medicine', 'medical'], ['medicine', 'doctor', 'clinical', 'patient']],
  ['climate', 'Climate', ['climate'], ['climate', 'warming', 'carbon', 'emissions']],
  ['environment', 'Environment', ['environment', 'conservation'], ['environment', 'conservation', 'wildlife', 'pollution']],
  ['energy', 'Energy', ['energy', 'utilities'], ['energy', 'power', 'utility', 'renewable']],
  ['education', 'Education', ['education', 'schools'], ['school', 'teacher', 'student', 'district']],
  ['higher-education', 'Higher education', ['higher education', 'colleges'], ['college', 'university', 'campus', 'faculty']],
  ['labor-workplace', 'Labor and workplace', ['labor', 'workplace'], ['labor', 'union', 'workplace', 'employment']],
  ['real-estate', 'Real estate', ['real estate', 'property'], ['real estate', 'property', 'broker', 'commercial']],
  ['housing', 'Housing', ['housing'], ['housing', 'rent', 'affordable', 'tenant']],
  ['construction-development', 'Construction and development', ['development', 'construction'], ['construction', 'development', 'zoning', 'building']],
  ['transportation', 'Transportation', ['transportation', 'transit'], ['transportation', 'transit', 'rail', 'airport']],
  ['automotive', 'Automotive', ['automotive', 'cars'], ['automotive', 'vehicle', 'car', 'dealer']],
  ['agriculture', 'Agriculture', ['agriculture', 'farming'], ['agriculture', 'farm', 'crop', 'livestock']],
  ['food-dining', 'Food and dining', ['food', 'dining', 'restaurants'], ['food', 'restaurant', 'chef', 'dining']],
  ['travel-tourism', 'Travel and tourism', ['travel', 'tourism'], ['travel', 'tourism', 'hotel', 'destination']],
  ['arts-culture', 'Arts and culture', ['arts', 'culture'], ['arts', 'culture', 'museum', 'gallery']],
  ['entertainment', 'Entertainment', ['entertainment'], ['entertainment', 'television', 'film', 'celebrity']],
  ['music', 'Music', ['music'], ['music', 'concert', 'album', 'artist']],
  ['books-publishing', 'Books and publishing', ['books', 'publishing'], ['book', 'author', 'publishing', 'literary']],
  ['lifestyle', 'Lifestyle', ['lifestyle'], ['lifestyle', 'home', 'family', 'wellness']],
  ['fashion-beauty', 'Fashion and beauty', ['fashion', 'beauty'], ['fashion', 'beauty', 'style', 'cosmetics']],
  ['consumer', 'Consumer affairs', ['consumer', 'consumer affairs'], ['consumer', 'product', 'recall', 'shopping']],
  ['retail-ecommerce', 'Retail and ecommerce', ['retail', 'ecommerce'], ['retail', 'ecommerce', 'store', 'shopping']],
  ['sports', 'Sports', ['sports'], ['sports', 'league', 'team', 'athlete']],
  ['local-sports', 'Local sports', ['local sports', 'high school sports'], ['local sports', 'high school', 'prep', 'athletics']],
  ['breaking-news', 'Breaking news', ['breaking', 'latest'], ['breaking', 'developing', 'alert', 'emergency']],
  ['investigations', 'Investigations', ['investigations', 'watchdog'], ['investigation', 'accountability', 'watchdog', 'records']],
  ['opinion', 'Opinion', ['opinion', 'editorial'], ['opinion', 'editorial', 'column', 'commentary']],
  ['newsletters', 'Newsletters', ['newsletter', 'briefing'], ['newsletter', 'briefing', 'digest', 'daily']],
].map(([id, name, sectionAliases, keywordHints]) => ({
  id: 'pbt_' + id,
  slug: id,
  name,
  sectionAliases,
  keywordHints,
}))

export const PRESS_BEAT_SLUGS = new Set(PRESS_BEATS.map(beat => beat.slug))

export function classifyBeatText(value, limit = 3) {
  const text = String(value || '').toLowerCase()
  if (!text) return []
  const ranked = PRESS_BEATS
    .map(beat => ({
      slug: beat.slug,
      score: [...beat.sectionAliases, ...beat.keywordHints]
        .reduce((sum, hint) => sum + (text.includes(hint) ? Math.max(1, hint.split(/\s+/).length) : 0), 0),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
  return ranked.slice(0, Math.max(1, limit)).map(item => item.slug)
}

export function normalizeBeatSlugs(values) {
  const list = Array.isArray(values) ? values : [values]
  const exact = list
    .map(value => String(value || '').trim().toLowerCase())
    .filter(value => PRESS_BEAT_SLUGS.has(value))
  const inferred = list.flatMap(value => classifyBeatText(value))
  return [...new Set([...exact, ...inferred])].slice(0, 3)
}
