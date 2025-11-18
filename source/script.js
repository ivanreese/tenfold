// CONFIG
const animate = true
const cycleTime = 8 // how many seconds per anim loop
const color = "#fff"

const MAX_DPR = 2 // Limit the DPR so we don't burn too much time

// ANIMATION PARAMS
// let q = 0
// let r = 0
let strokeWidth = 0

// HELPERS
const PI = Math.PI
const TAU = PI * 2
const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v))
const norm = (n, lo = -1, hi = 1) => (n - lo) / (hi - lo)
const denorm = (n, lo = -1, hi = 1) => n * (hi - lo) + lo
const renorm = (n, lo = -1, hi = 1, LO = -1, HI = 1) => denorm(norm(n, lo, hi), LO, HI)
const declip = (n, lo = 0, hi = 1) => denorm(norm(n), lo, hi)

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

// CANVAS STUFF
const canvases = Array.from(document.querySelectorAll(".char"))
const ctxs = []
let dpr = clamp(window.devicePixelRatio, 1, MAX_DPR)
let w = canvases[0].offsetWidth * dpr
let hw = w / 2

// DRAW FNS ///////////////////////////////////////////////////////////////////////////////////////

const circle = (ctx, q, r, s, t) => {
  ctx.circle(Math.cos(t * TAU) * q * 0.25, Math.sin(t * TAU) * r * 0.25, 0.1)
}

const catenoid = (ctx, q, r, s, t) => {
  let U = Math.round(36 + Math.round(ctx.x * 16) * 2) // segments around the circle
  let V = Math.round(10 + ctx.y * 5) // segments along the curve
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

  // for (let u = 0; u < U; u++) {
  //   for (let v = 0; v <= V; v++) {
  //     let y = denorm(v / V)
  //     let x =
  //     let z = 0

  //   }
  // }

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
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)

    // next point along the curve (not wrapping)
    if ((i + 1) % (V + 1) != 0) {
      let b = points[i + 1]
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
    }
  }
}

const doubleyou = (ctx, q, r, s, t) => {
  // t goes from 0 to 1
  t = denorm((t + 1.5) % 1) // -1 to 1
  t = Math.sign(t) * Math.abs(t) ** 4 // -1 to 1, squished
  let R = declip(r, 0.2, 2)
  let m = declip(t, 1, -2) * R
  let M = declip(t, 2, -1) * R

  for (let x = m; x <= M; x += 0.01) {
    let y = -Math.cos((x * TAU * 2) / R) * 0.8 + 0.2
    if (x == m) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  let J = declip(q, 0.05, 1)
  for (let j = 0; j < 1; j += J) {
    for (let x = m; x <= M; x += 0.01) {
      let frac = renorm(x, m, M, 0, 1)
      let y = -Math.cos((x * TAU * 2) / R) * 0.8 - declip(Math.cos(TAU * frac + PI)) * 0.4 * j + 0.2
      if (x == m) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
  }
}

const cross = (ctx, q, r, s, t) => {
  let angle = r * TAU
  ctx.rotate(angle)
  let d = q
  ctx.moveTo(-d, -d)
  ctx.lineTo(+d, +d)
  ctx.moveTo(+d, -d)
  ctx.lineTo(-d, +d)
  ctx.stroke()
}

const enca = new OffscreenCanvas(1, 1)
const enc = enca.getContext("2d", { alpha: true, willReadFrequently: true })

const en = (ctx, q, r, s, t) => {
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
        ctx.moveTo(X, Y)
        ctx.lineTo(X + ctx.x * 0.2 + 0.1, Y + ctx.y * 0.2 + 0.1)
      }
    }
  }
}

const kay = (ctx, q, r, s, t, params) => {
  // if (params.someDep) {
  //   return {
  //     plz: "cheeseburger"
  //   }
  // }

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

const ess = {
  bits: [],
  draw: (bits, w, t) => {
    for (let i = 0; i < w * w; i++) {
      bits[i] = Math.random() > 0.5
    }
  },
}

// CONTROLS ///////////////////////////////////////////////////////////////////////////////////////

// KAOSS PAD
let controls = document.querySelector("#controls")
let ctrls = controls.getContext("2d", { alpha: true })

controls.onpointerdown = (e) => {
  let ctx
  closest = Infinity

  let q = clamp(renorm(e.offsetX, 0, controls.offsetWidth, 0, 3) - 2)
  let r = clamp(renorm(e.offsetY, 0, controls.offsetHeight))

  for (let c of ctxs) {
    let dist = Math.hypot(q - c.q, r - c.r)
    if (dist < closest) {
      ctx = c
      closest = dist
    }
  }

  controls.onpointermove = (e) => {
    e.preventDefault() // Prevent unwanted text selection
    ctx.q = clamp(renorm(e.offsetX, 0, controls.offsetWidth, 0, 3) - 2) // this is subtle, sorry
    ctx.r = clamp(renorm(e.offsetY, 0, controls.offsetHeight))

    if (!animate) requestAnimationFrame(update)
  }
  window.onpointerup = () => {
    controls.onpointermove = null
    window.onpointerup = null
  }
}

// STROKE SLIDER
strokeSlider = document.querySelector("[type=range]")
strokeSlider.oninput = (e) => {
  strokeWidth = +strokeSlider.value
  if (!animate) requestAnimationFrame(update)
}
strokeSlider.value = strokeWidth

// ENGINE /////////////////////////////////////////////////////////////////////////////////////////

const defns = [catenoid, en, kay, ess, doubleyou, cross, cross, cross, cross]

for (let canvas of canvases) {
  let i = ctxs.length
  let ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true })
  ctxs.push(ctx)

  // TODO: Proxy??
  ctx.circle = (x, y, r) => {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.stroke()
  }

  // TODO: this needs to go somewhere
  ctx.x = Math.random() * 2 - 1
  ctx.y = Math.random() * 2 - 1
  ctx.q = renorm(i, -1, 9, -1, 1)
  ctx.r = Math.random() * 2 - 1
  ctx.dist = 0

  // TODO: Visual feedback?
  canvas.onpointerdown = () => {
    canvas.onpointermove = (e) => {
      ctx.x = clamp(renorm(e.offsetX, 0, hw))
      ctx.y = clamp(renorm(e.offsetY, 0, hw))
      if (!animate) requestAnimationFrame(update)
    }
    window.onpointerup = () => {
      canvas.onpointermove = null
      window.onpointerup = null
    }
  }

  canvas.addEventListener("pointermove", (e) => {
    let x = clamp(renorm(e.offsetX, 0, hw))
    let y = clamp(renorm(e.offsetY, 0, hw))
    ctx.dist = 1 - Math.hypot(x - ctx.x, y - ctx.y)
  })
}

function resize() {
  // CHARS
  dpr = clamp(window.devicePixelRatio, 1, MAX_DPR)
  w = canvases[0].offsetWidth * dpr
  hw = w / 2
  for (let canvas of canvases) canvas.width = canvas.height = w

  // BITS
  for (let def of defns) {
    if (def.bits) {
      def._bytes = new Uint8ClampedArray(w * w * 4).fill(255)
      def._imgData = new ImageData(def._bytes, w)
    }
    def._timer ??= new Averager(30)
  }

  // CONTROLS
  controls.width = w * 3
  controls.height = w
  if (!animate) requestAnimationFrame(update)
}

function getFn(def) {
  if (def instanceof Function) return def
  if (!(def?.draw instanceof Function)) throw new Error("Invalid character definition")
  return def.draw
}

let mappers = Array.from("INKSWITCH")

function update(ms) {
  if (animate) requestAnimationFrame(update)
  if (document.hidden) return

  let t = (ms / 1000 / cycleTime) % 1

  ctrls.clearRect(0, 0, w * 3, w)
  const ctrlsImageData = ctrls.getImageData(0, 0, w * 3, w)
  const ctrlsImageDataData = ctrlsImageData.data

  for (let i = 0; i < defns.length; i++) {
    let start = performance.now()
    let def = defns[i]
    let ctx = ctxs[i]

    if (def.bits) {
      def.draw(def.bits, w, t)
      for (let i = 0; i < def.bits.length; i++) def._bytes[i * 4] = def._bytes[i * 4 + 1] = def._bytes[i * 4 + 2] = Math.ceil(def.bits[i]) * 255
      ctx.putImageData(def._imgData, 0, 0)
    } else {
      let fn = getFn(def)

      // These get reset sporadically, so we just set them every time we draw
      // ctx.fillStyle = "#000"
      ctx.strokeStyle = "#fff"
      ctx.lineJoin = ctx.lineCap = "round"
      ctx.lineWidth = (strokeWidth * 50 + 8) / w

      // Clear and set up transform
      ctx.resetTransform()
      ctx.clearRect(0, 0, w, w) // clear the canvas now, before we scale it
      ctx.scale(hw, hw) // 0 to 2
      ctx.translate(1, 1) // -1 to 1
      ctx.scale(1 - ctx.lineWidth, 1 - ctx.lineWidth) // Shrink slightly so that a stroke drawn at the edge doesn't get cut off

      // Draw the character!
      ctx.beginPath()
      ctx.save()
      fn(ctx, ctx.q, ctx.r, 0, t)
      ctx.stroke()
      ctx.restore()

      ctx.fillStyle = color
      ctx.textAlign = "end"
      ctx.font = `.07px monospace`
      // ctx.fillText(`Q${(ctx.q * 50 + 50) | 0} R${(ctx.r * 50 + 50) | 0} X${(ctx.x * 50 + 50) | 0} Y${(ctx.y * 50 + 50) | 0}`, 1, 1)

      ctx.beginPath()
      ctx.fillStyle = `hsla(0 0% 100% / ${ctx.dist})`
      ctx.arc(ctx.x, ctx.y, 0.03, 0, TAU)
      ctx.fill()
      ctx.beginPath()

      ctrls.beginPath()
      ctrls.fillStyle = color
      // ctrls.fillRect(w + ctx.x * w * 2, ctx.y * w, 10, 10)

      ctrls.beginPath()
      // ctrls.arc(declip(ctx.q, w, w * 3), declip(ctx.r, 0, w), 8, 0, TAU)
      if (ctx.q != null) {
        let x = declip(ctx.q, w, w * 3)
        let y = declip(ctx.r, 0, w)
        let p = 40
        ctrls.beginPath()
        let x1 = x + declip(ctx.q, p / 2, p)
        let y1 = y - declip(ctx.r, p / 2, p)
        let x2 = x - declip(ctx.x, p / 2, p)
        let y2 = y + declip(ctx.y, p / 2, p)

        ctrls.moveTo(x, y1)
        ctrls.lineTo(x1, y)
        ctrls.lineTo(x, y2)
        ctrls.lineTo(x2, y)
        ctrls.lineTo(x, y1)
        ctrls.fill()
        ctrls.beginPath()
        ctrls.font = `${dpr * 12}px monospace`
        ctrls.textAlign = "center"
        ctrls.fillStyle = "#000"
        ctrls.fillText(mappers[i], (x1 + x2) / 2, (y1 + y2) / 2 + 5)
      }
      // ctrls.fill()
    }

    let cost = def._timer.add(performance.now() - start)

    // Force the image to be pure black-and-white (todo: we could just disallow setting colors, and ignore AA — would be faster)
    // const imgData = ctx.getImageData(0, 0, w, w)
    // const data = imgData.data
    // for (let i = 0; i < data.length; i += 4) {
    //   // data[i] = data[i + 1] = data[i + 2] = data[i] < 127 ? 0 : 255
    //   ctrlsImageDataData[i] = ctrlsImageDataData[i + 1] = ctrlsImageDataData[i + 2] = data[i]
    //   ctrlsImageDataData[i + 3] = 255
    // }

    // If the draw function took too long, apply shame
    // if (cost > 3) {
    //   ctx.resetTransform()
    //   ctx.fillStyle = "#f00"
    //   ctx.textAlign = "end"
    //   ctx.font = `${dpr * 16}px monospace`
    //   ctx.fillText(Math.round(cost), w * 0.99, w * 0.05)
    // }
  }

  // ctrls.putImageData(ctrlsImageData, 220, 10)

  // DRAW THE CONTROLS

  // Basic state

  // &
  ctrls.lineWidth = 0.5
  ctrls.fillStyle = color
  ctrls.textAlign = "center"
  ctrls.font = `100 ${w}px monospace`
  ctrls.fillText("&", hw, hw * 1.7)

  // Kaoss pad
  ctrls.beginPath()
  ctrls.strokeStyle = color
  ctrls.rect(w, 0, w * 2, w)
  ctrls.stroke()

  // Kaoss Arm
  // ctrls.strokeStyle = color
  // ctrls.lineWidth = 36
  // ctrls.beginPath()
  // let ax = declip(q, w, w * 3)
  // let ay = declip(r, 0, w)
  // ctrls.moveTo(w * 1.5 - ax, w * 0.95 - ay)
  // ctrls.lineTo(ax, ay, 10, 0, TAU)
  // ctrls.stroke()

  // Kaoss stats
  // ctrls.fillStyle = color
  // ctrls.textAlign = "end"
  // ctrls.font = `${dpr * 12}px monospace`
  // ctrls.fillText(`q: ${q.toFixed(1)}  r: ${r.toFixed(1)}`, w * 2.99, w * 0.99)

  // Clock
  {
    let x = w + t * w * 2
    ctrls.beginPath()
    ctrls.lineWidth = 2
    ctrls.moveTo(x, w - 30)
    ctrls.lineTo(x, w)
    ctrls.stroke()
  }
}

// INIT

resize()
window.addEventListener("resize", resize)
if (animate) requestAnimationFrame(update)
