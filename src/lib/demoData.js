// Synthetic dataset for styling/dev work: `?demo` on the dev server loads it.
// Never bundled into production behavior — the caller gates on import.meta.env.DEV.

const FIRST = ['Aarav', 'Diya', 'Vihaan', 'Ananya', 'Arjun', 'Ishita', 'Kabir', 'Meera',
  'Rohan', 'Sanya', 'Aditya', 'Priya', 'Karan', 'Nisha', 'Varun', 'Pooja', 'Nikhil', 'Tara', 'Rahul', 'Sneha']
const LAST = ['Sharma', 'Patel', 'Reddy', 'Iyer', 'Khan', 'Nair', 'Gupta', 'Das',
  'Mehta', 'Rao', 'Joshi', 'Bose', 'Kulkarni', 'Singh', 'Verma', 'Menon', 'Pillai', 'Shetty', 'Chopra', 'Kaur']

function lcg(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

export function makeDemoData() {
  const rand = lcg(20260731)
  const year = 2026, month = 6 // July
  const weekdays = []
  for (let d = 1; d <= 31; d++) {
    const wd = new Date(year, month, d).getDay()
    if (wd !== 0 && wd !== 6) weekdays.push(d)
  }

  const events = []
  const mapping = []
  for (let i = 0; i < 20; i++) {
    const card = 1001 + i
    mapping.push({ card, name: `${FIRST[i]} ${LAST[i]}`, empId: `G${1500 + i}` })
    const presentTarget = 3 + Math.floor(rand() * 19)
    const days = [...weekdays].sort(() => rand() - 0.5).slice(0, presentTarget)
    for (const d of days) {
      const inMin = 8 * 60 + 30 + Math.floor(rand() * 180)
      const single = rand() < 0.08
      events.push({ card, ts: new Date(year, month, d, Math.floor(inMin / 60), inMin % 60) })
      if (!single) {
        const stay = 4 * 60 + Math.floor(rand() * 300)
        const outMin = inMin + stay
        const mid = inMin + Math.floor(stay / 2)
        events.push({ card, ts: new Date(year, month, d, Math.floor(mid / 60), mid % 60) })
        events.push({ card, ts: new Date(year, month, d, Math.floor(outMin / 60) % 24, outMin % 60) })
      }
    }
  }
  events.sort((a, b) => a.ts - b.ts)
  return { events, mapping }
}
