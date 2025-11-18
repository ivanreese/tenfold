// CONFIG
const animate = true
const cycleTime = 8 // how many seconds per anim loop
const color = "#fff"
const MAX_DPR = 2 // Limit the DPR so we don't burn too much time
const padding = 40

// ANIMATION PARAMS
let q = 0
let r = 0

// HELPERS
const PI = Math.PI
const TAU = PI * 2

const rand = (lo = -1, hi = 1) => denorm(Math.random(), lo, hi)
const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v))
const norm = (n, lo = -1, hi = 1) => (n - lo) / (hi - lo)
const denorm = (n, lo = -1, hi = 1) => n * (hi - lo) + lo
const declip = (n, lo = 0, hi = 1) => denorm(norm(n), lo, hi)
const renorm = (v, lo = -1, hi = 1, LO = -1, HI = 1, doClamp = false) => {
  let n = norm(v, lo, hi)
  if (doClamp) n = clamp(n, lo, hi)
  return denorm(n, LO, HI)
}

class Averager {
  result = 0
  tally = 0
  values = []

  constructor(limit) {
    this.limit = limit
  }

  add(value) {
    this.tally += value
    this.values.push(value)
    while (this.values.length > this.limit) this.tally -= this.values.shift()
    this.result = this.tally / this.values.length
    return this.result
  }
}

// CANVAS /////////////////////////////////////////////////////////////////////////////////////////

const canvas = document.querySelector("canvas")
const ctx = canvas.getContext("2d", { alpha: true })
let cssX // canvas top
let cssY // canvas left
let cssW // grid cell width
let dpr
let w // grid cell width
let hw

function resize() {
  // This is the max area the canvas will be contained within
  let iw = window.innerWidth - padding * 2
  let ih = window.innerHeight - padding * 2

  // This is the size of a grid cell in CSS pixels
  cssW = Math.min(iw / 3, ih / 4)

  // We need the half-width (hw) to be floored, so we sized things based on that
  cssW = Math.floor(cssW / 2) * 2

  canvas.style.width = cssW * 3 + "px"
  canvas.style.height = cssW * 4 + "px"

  // this is the top left corner of the canvas in CSS pixels
  cssX = padding + (iw - cssW * 3) / 2
  cssY = padding + (ih - cssW * 4) / 2

  // Now calculate the pixel sizes within the canvas
  dpr = clamp(Math.round(window.devicePixelRatio || 1), 1, MAX_DPR)
  w = cssW * dpr // width
  hw = w / 2 // half-width — we know this is an integer
  canvas.width = w * 3
  canvas.height = w * 4
}
resize()
window.addEventListener("resize", resize)

// x ranges from 0 to 3, y from 0 to 4
const posToGridNorm = (x, y) => ({
  x: renorm(x, cssX, cssX + cssW, 0, 1),
  y: renorm(y, cssY, cssY + cssW, 0, 1),
})

const gridNormToIdx = (x, y) => {
  x = Math.floor(x)
  y = Math.floor(y)
  if (x < 0 || y < 0 || x > 2 || y > 3) return -1
  return 3 * Math.floor(y) + Math.floor(x)
}

let dragging = -1
let closest
let draggingType

window.addEventListener("pointerdown", (e) => {
  let { x, y } = posToGridNorm(e.clientX, e.clientY)

  _x = Math.floor(x)
  _y = Math.floor(y)

  dragging = gridNormToIdx(x, y)
  if (dragging < 0) return

  // get the closest object
  closest = null
  let closestDist = 20 // need to be within this dist for the drag to count
  for (let s of states) {
    let dist = Math.hypot(denorm(x - _x) - s.x, denorm(y - _y) - s.y)
    if (dist >= closestDist) continue
    closest = s
    closestDist = dist
    draggingType = "canvas"
  }
  for (let s of states) {
    let dist = Math.hypot(renorm(x, 1, 3, -1, 1) - s.q, denorm(y - _y) - s.r)
    if (dist >= closestDist) continue
    closest = s
    closestDist = dist
    draggingType = "param"
  }
})
window.addEventListener("pointermove", (e) => {
  if (dragging < 0) return
  e.preventDefault() // Prevent unwanted text selection

  let { x, y } = posToGridNorm(e.clientX, e.clientY)

  if (closest) {
    if (draggingType == "canvas") {
      closest.x = denorm(x % 1)
      closest.y = denorm(y % 1)
    } else if (draggingType == "param") {
      closest.q = renorm(x, 1, 3, -1, 1)
      closest.r = denorm(y % 1)
    }
  }

  // if (dragging == 5 || dragging == 6) {
  // q = renorm(e.offsetX, (cw * 1) / 3, (cw * 3) / 3, -1, 1, true)
  // r = renorm(e.offsetY, (ch * 1) / 4, (ch * 2) / 4, -1, 1, true)
  // } else {
  // }
})
window.addEventListener("pointerup", (e) => (dragging = -1))
window.addEventListener("pointercancel", (e) => (dragging = -1))

// DRAW FNS ///////////////////////////////////////////////////////////////////////////////////////

const circle = (ctx, q, r, t) => {
  ctx.circle(Math.cos(t * TAU) * q * 0.25, Math.sin(t * TAU) * r * 0.25, 0.1)
}

const catenoid = (ctx, q, r, t, X, Y) => {
  let U = Math.round(36 + Math.round(X * 16) * 2) // segments around the circle
  let V = Math.round(10 + Y) // segments along the curve
  let rad = 0.1 // shift the curve away from the y axis
  let a = r + 1.2 // factor for the catenary curve
  let tilt = q * 0.2 + 0.2 // rotation around the x axis
  let roll = Math.sin(t * TAU) ** 7 * 0.03 // animated roll around the z axis
  let points = []
  let xmin = 0
  let xmax = 0
  let ymin = 0
  let ymax = 0

  let point = (u, v) => {
    // Draw the catenary curve in the xy plane
    let y = denorm(v / V)
    let x = rad + a * Math.cosh(y / a) - a
    let z = 0

    // Lathe around the Y axis
    let uf = TAU * (u / U - 0.25)
    let x1 = x * Math.cos(uf) - z * Math.sin(uf)
    let z1 = x * Math.sin(uf) + z * Math.cos(uf)

    // Tilt around the X axis (for visual interest)
    let y1 = y * Math.cos(tilt) - z1 * Math.sin(tilt)
    let z2 = y * Math.sin(tilt) + z1 * Math.cos(tilt)

    // Roll around the Z axis (animation)
    let x2 = x1 * Math.cos(roll) - y1 * Math.sin(roll)
    let y2 = x1 * Math.sin(roll) + y1 * Math.cos(roll)

    return { x: x2, y: y2 }
  }

  // build all points, and track the bounds
  for (let u = 0; u < U; u++) {
    for (let v = 0; v <= V; v++) {
      let p = point(u, v)
      points.push(p)
      xmin = Math.min(p.x, xmin)
      xmax = Math.max(p.x, xmax)
      ymin = Math.min(p.y, ymin)
      ymax = Math.max(p.y, ymax)
    }
  }

  // Normalize points to clip space
  for (let p of points) {
    p.x = renorm(p.x, xmin, xmax)
    p.y = renorm(p.y, ymin, ymax)
  }

  // render the wireframe
  for (let i = 0; i < points.length; i++) {
    // current point
    let a = points[i]

    // next point around the circle (wrapping)
    let b = points[(i + (V + 1)) % points.length]
    ctx.move(a.x, a.y)
    ctx.line(b.x, b.y)

    // next point along the curve (not wrapping)
    if ((i + 1) % (V + 1) != 0) {
      let b = points[i + 1]
      ctx.move(a.x, a.y)
      ctx.line(b.x, b.y)
    }
  }
}

const doubleyou = (ctx, q, r, t, X, Y) => {
  t = denorm((t + 1.5) % 1) // -1 to 1, phase shifted
  t = Math.sign(t) * Math.abs(t) ** 4 // -1 to 1, squished
  let J = declip(q, 0.05, 1) // how many wiggles
  let R = declip(r, 0.2, 2) // how tight are the wiggles
  let m = declip(t, 1, -2) * R // wiggle start
  let M = declip(t, 2, -1) * R // wiggle end
  for (let j = 0; j < 1; j += J) {
    ctx.begin()
    for (let x = m; x <= M; x += 0.01) {
      let frac = renorm(x, m, M, 0, 1)
      let y = -Math.cos((x * TAU * 2) / R) * 0.8 - declip(Math.cos(TAU * frac + PI)) * 0.4 * j + 0.2
      if (x < -1 || x > 1) continue
      ctx.line(x, y)
    }
  }
}

const cross = (ctx, q, r, t, X, Y) => {
  // let angle = r * TAU
  // ctx.rotate(angle)
  let d = q
  ctx.move(-d, -d)
  ctx.line(+d, +d)
  ctx.move(+d, -d)
  ctx.line(-d, +d)
}

const enca = new OffscreenCanvas(1, 1)
const enc = enca.getContext("2d", { alpha: true, willReadFrequently: true })

const en = (ctx, q, r, t, x1, y1) => {
  const steps = Math.round(denorm(declip(q) ** 4, 3, 100))
  enca.width = steps
  enca.height = steps
  enc.fillStyle = color
  enc.font = "1.3px sans-serif"
  enc.textAlign = "center"
  enc.scale(steps, steps)
  enc.fillText("N", 0.5, 1)
  let kData = enc.getImageData(0, 0, steps, steps).data

  for (let x = 0; x < steps; x++) {
    for (let y = 0; y < steps; y++) {
      if (kData[(x + y * steps) * 4] >= 128) {
        let X = renorm(x, 0, steps)
        let Y = renorm(y, 0, steps)
        ctx.move(X, Y)
        ctx.line(X + x1 * 0.2 + 0.1, Y + y1 * 0.2 + 0.1)
      }
    }
  }
}

const kay = (ctx, q, r, t, X, Y) => {
  r = declip(r, 0.01, 0.1) + Math.sin(t * TAU * 2) * 0.01

  const steps = Math.round(declip(q, 5, 30))
  const c = new OffscreenCanvas(steps, steps).getContext("2d", { alpha: true, willReadFrequently: true })
  c.fillStyle = color
  c.font = "1px sans-serif"
  c.textAlign = "center"
  c.scale(steps, steps)
  c.fillText("k", 0.5, 1)
  let kData = c.getImageData(0, 0, steps, steps).data

  for (let x = 0; x < steps; x++) {
    for (let y = 0; y < steps; y++) {
      if (kData[(x + y * steps) * 4] >= 128) ctx.circle(renorm(x, 0, steps), renorm(y, 0, steps), r)
    }
  }
}

// ENGINE /////////////////////////////////////////////////////////////////////////////////////////

const defns = [catenoid, en, kay, cross, doubleyou, cross, cross, cross, cross]
const states = []

// Initialize the param state for each letter
for (let i = 0; i < 9; i++) {
  let s = (states[i] = {})
  s.q = renorm(i, -1, 9)
  s.r = 0
  s.x = 0
  s.y = 0
}

let newPath = true

const proxy = {
  begin() {
    newPath = true
  },
  move(x, y) {
    ctx.moveTo(x, y)
    newPath = false
  },
  line(x, y) {
    if (newPath) {
      ctx.moveTo(x, y)
      newPath = false
    } else {
      ctx.lineTo(x, y)
    }
  },
  rect(x, y, w, h) {
    ctx.moveTo(x, y)
    ctx.rect(x, y, w, h)
    newPath = true
  },
  circle(x, y, r) {
    proxy.arc(x, y, r)
  },
  arc(x, y, r, start = 0, end = TAU) {
    ctx.moveTo(x + r, y)
    ctx.arc(x, y, r, start, end)
    newPath = true
  },
}

let mappers = Array.from("INKSWITCH")

function update(ms) {
  requestAnimationFrame(update)
  if (document.hidden) return

  let t = (ms / 1000 / cycleTime) % 1

  ctx.clearRect(0, 0, w * 3, w * 4)

  for (let i = 0; i < 9; i++) {
    let start = performance.now()
    let fn = defns[i]
    let s = states[i]

    // These get reset sporadically, so we just set them every time we draw
    // ctx.fillStyle = "#000"
    ctx.strokeStyle = color
    ctx.lineJoin = ctx.lineCap = "round"
    ctx.lineWidth = (dpr * 4) / w

    // Clear and set up transform
    ctx.resetTransform()
    ctx.scale(hw, hw) // 0 to 2
    ctx.translate(1, 1) // -1 to 1
    ctx.scale(1 - ctx.lineWidth, 1 - ctx.lineWidth) // Shrink slightly so that a stroke drawn at the edge doesn't get cut off
    let x = Math.floor(i % 3)
    let y = Math.floor(i / 3)
    y = y > 0 ? y + 1 : y
    ctx.translate(x * 2, y * 2) // center on the current grid cell

    // Draw the character!
    newPath = true
    ctx.beginPath()
    ctx.save()
    fn(proxy, s.q, s.r, t, s.x, s.y)
    ctx.stroke()

    // circles in canvas
    ctx.beginPath()
    proxy.circle(s.x, s.y, 0.1)
    ctx.fill()
    ctx.restore()

    // param circles
    ctx.resetTransform()
    ctx.scale(w, w) // note! scale is doubled compared to other stuffs
    ctx.beginPath()
    proxy.circle(declip(s.q, 1, 3), declip(s.r, 1, 2), 0.1 / 2)
    ctx.fill()

    // let cost = def._timer.add(performance.now() - start)

    // If the draw function took too long, apply shame
    // if (cost > 3) {
    //   ctx.resetTransform()
    //   ctx.fillStyle = "#f00"
    //   ctx.textAlign = "end"
    //   ctx.font = `${dpr * 16}px monospace`
    //   ctx.fillText(Math.round(cost), w * 0.99, w * 0.05)
    // }
  }

  // DRAW THE CONTROLS
  ctx.resetTransform()

  // &
  ctx.fillStyle = color
  ctx.textAlign = "center"
  ctx.font = `100 ${w}px monospace`
  ctx.fillText("&", hw, w + hw * 1.7)

  // Kaoss pad
  ctx.beginPath()
  ctx.lineWidth = 2 * dpr
  ctx.strokeStyle = "#fff"
  ctx.rect(w + 2, w + 2, w * 2 - 4, w - 4)
  ctx.stroke()

  // Clock
  {
    ctx.beginPath()
    ctx.lineWidth = 2 * dpr
    let x = denorm(t, w, w * 3)
    let y = w * 2
    ctx.moveTo(x, y)
    ctx.lineTo(x, y - 50)
    ctx.stroke()
  }
}

// INIT

requestAnimationFrame(update)
