export const mergeSupportMessages = (previous, incoming) => [...new Map([...previous, ...incoming].map(message => [message._id, message])).values()].sort((a, b) => a.sequence - b.sequence);

// A tab may sleep long enough to miss more than one history page. Start from
// the new page in that case, so its earlier-message cursor can recover the gap.
export function mergeSupportPage(previous, incoming) {
  const reset = Boolean(previous.length && incoming.length && incoming[0].sequence > previous.at(-1).sequence + 1);
  return { messages: reset ? incoming : mergeSupportMessages(previous, incoming), reset };
}
