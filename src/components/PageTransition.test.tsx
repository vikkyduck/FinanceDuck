import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { PageTransition } from "./PageTransition"

let tree: ReactTestRenderer | undefined

beforeEach(() => {
  vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: false })) })
})

afterEach(() => {
  act(() => tree?.unmount())
  tree = undefined
  vi.unstubAllGlobals()
})

function finishEntry() {
  const wrapper = tree!.root.findByType("div")
  const element = {} as HTMLDivElement
  act(() => wrapper.props.onAnimationEnd({
    target: element,
    currentTarget: element,
    animationName: "page-slide-in-up",
  }))
}

it("releases the animated ancestor after its own entry animation ends", () => {
  act(() => { tree = create(<PageTransition><span>Invoice list</span></PageTransition>) })

  expect(tree!.root.findByType("div").props.className).toContain("page-enter")
  finishEntry()

  const wrapper = tree!.root.findByType("div")
  expect(wrapper.props.className.trim()).toBe("page-transition-wrapper")
  expect(tree!.root.findByType("span").children).toEqual(["Invoice list"])
})

it.each(["child-entry", "other-wrapper-animation"])(
  "does not finish page entry for %s", kind => {
    act(() => { tree = create(<PageTransition><span>Animated child</span></PageTransition>) })
    const wrapper = tree!.root.findByType("div")
    const element = {} as HTMLDivElement
    act(() => wrapper.props.onAnimationEnd({
      target: kind === "child-entry" ? {} as HTMLSpanElement : element,
      currentTarget: element,
      animationName: kind === "child-entry" ? "page-slide-in-up" : "skeleton-pulse",
    }))

    expect(tree!.root.findByType("div").props.className).toContain("page-enter")
    finishEntry()
    expect(tree!.root.findByType("div").props.className.trim()).toBe("page-transition-wrapper")
  },
)

it("starts without an animated ancestor when reduced motion suppresses animation events", () => {
  vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: true })) })
  act(() => { tree = create(<PageTransition><span>Invoice list</span></PageTransition>) })

  expect(tree!.root.findByType("div").props.className.trim()).toBe("page-transition-wrapper")
})

it("replays entry for a pathname key change but leaves query-only updates idle", () => {
  const route = (pathname: string, search: string) => (
    <PageTransition key={pathname}><span>{pathname}{search}</span></PageTransition>
  )
  act(() => { tree = create(route("/invoices", "?page=1")) })
  finishEntry()

  act(() => { tree!.update(route("/invoices", "?page=2")) })
  expect(tree!.root.findByType("div").props.className.trim()).toBe("page-transition-wrapper")

  act(() => { tree!.update(route("/stats", "")) })
  expect(tree!.root.findByType("div").props.className).toContain("page-enter")
  finishEntry()
  expect(tree!.root.findByType("div").props.className.trim()).toBe("page-transition-wrapper")
})
