// QuoteBlock — a quote block.
export default function QuoteBlock({ text = '' }) {
  return `<blockquote class="quote-block">${text}</blockquote>`
}