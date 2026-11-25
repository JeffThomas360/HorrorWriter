/**
 * The reasons a member can give when reporting something, in the order the report
 * form lists them. The values are the ones `reports.category` accepts.
 *
 * `only` limits a reason to one kind of target: "Written by AI" is about House
 * Rule 4, which covers stories.
 */
export const REPORT_CATEGORIES = [
  { value: 'harassment', label: 'Harassment / Hate Speech' },
  { value: 'spam', label: 'Spam / Bots' },
  { value: 'urgent', label: 'Urgent / Real-world Harm' },
  { value: 'other', label: 'Other Violation' },
  { value: 'ai_written', label: 'Written by AI', only: 'story' },
]

/** The reasons to offer for one kind of target. */
export function categoriesFor(targetType) {
  return REPORT_CATEGORIES.filter((c) => !c.only || c.only === targetType)
}

/** A category's name as staff read it; an unknown value is shown as it is stored. */
export function categoryLabel(value) {
  return REPORT_CATEGORIES.find((c) => c.value === value)?.label ?? value
}
