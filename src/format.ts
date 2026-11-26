// Number formats shared by the dashboard and the chores sheet.

export const pad = (n: number) => String(n).padStart(2, '0')

// $3.50 everywhere a total or entry is shown.
export const money = (n: number) => '$' + n.toFixed(2)

// $3 or $3.50: drops the cents when there are none, for tight spots like the calendar.
export const shortMoney = (n: number) => '$' + (Number.isInteger(n) ? n : n.toFixed(2))

export const chores = (n: number) => `${n} ${n === 1 ? 'chore' : 'chores'}`
