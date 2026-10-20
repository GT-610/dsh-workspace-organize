/**
 * Test double for `@deepseek-ai/dsh-client-ui-primitives`.
 *
 * The published ESM entry of the primitives imports a runtime it does not
 * declare (`clsx`, `mdast-*`, `micromark-*`, the shiki grammar catalog), so only
 * the web shell — which seeds its own bundled copy into the module table — can
 * load it. A test process therefore substitutes this double: it keeps the
 * contract this plugin depends on (which children render, which callback fires)
 * so a component test still proves the plugin's own wiring. The real artwork,
 * menu surface and modal are exercised by the shell itself.
 */
import type { ReactNode } from 'react'

/** Shared props of every icon component. */
interface IconProps {
  size?: number | undefined
  className?: string | undefined
}

/** One data row of {@link Menu}, as the shipped component declares it. */
export interface MenuItem {
  id: string
  label: ReactNode
  disabled?: boolean
  icon?: ReactNode
  danger?: boolean
  submenu?: readonly MenuItem[]
}

/** Hairline between item groups (not selectable). */
export interface MenuSeparator {
  type: 'separator'
  id: string
}

/** Non-interactive heading row above a group of items. */
export interface MenuLabel {
  type: 'label'
  id: string
  text: string
}

/** One primary-menu entry: a row, a separator, or a heading label. */
export type MenuEntry = MenuItem | MenuSeparator | MenuLabel

/** Build one icon double that records which glyph was requested. */
function icon(name: string) {
  return function Icon({ size }: IconProps) {
    return <svg data-icon={name} width={size} height={size} />
  }
}

export const IconArchiveOutlineRegular = icon('archive')
export const IconChevronsUpDownOutlineRegular = icon('chevrons-up-down')
export const IconEditOutlineRegular = icon('edit')
export const IconEllipsisOutlineRegular = icon('ellipsis')
export const IconFolderCloseRegular = icon('folder-close')
export const IconFolderOpenOutlineRegular = icon('folder-open-outline')
export const IconFolderOpenRegular = icon('folder-open')
export const IconProjectAddOutlineRegular = icon('project-add')
export const IconSearchOutlineRegular = icon('search')
export const IconSlidersTwoOutlineRegular = icon('sliders-two')
export const IconTrashOutlineRegular = icon('trash')
export const IconTriangleRightFillRegular = icon('triangle-right')
export const IconUnarchiveOutlineRegular = icon('unarchive')

/** State dot double exposing the state it was asked to paint. */
export function StateDot({ state, size }: { state: string; size?: number | undefined; className?: string | undefined }) {
  return <span data-state-dot={state} data-size={size ?? ''} />
}

/** Tooltip double: renders its anchor and records the label. */
export function Tooltip({ label, children }: { label: string | (() => string); children: ReactNode }) {
  return <span data-tooltip={typeof label === 'function' ? label() : label}>{children}</span>
}

/** Button double forwarding native attributes. */
export function Button({ variant, size, icon: leading, children, ...rest }: {
  variant?: string
  size?: string
  icon?: ReactNode
  children?: ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  void variant
  void size
  return <button type="button" {...rest}>{leading}{children}</button>
}

/** Input double forwarding native attributes. */
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} />
}

/**
 * Menu double: renders the anchor plus, while open, one button per row.
 *
 * Submenu rows render their children inline so a test can reach a nested entry
 * without simulating hover.
 */
export function Menu({ open, anchor, items = [], selectedId, onSelect, onClose }: {
  open: boolean
  anchor: ReactNode
  items?: readonly MenuEntry[]
  selectedId?: string | undefined
  onSelect?: (id: string) => void
  onClose: () => void
  [key: string]: unknown
}) {
  if (!open) return <>{anchor}</>
  return (
    <>
      {anchor}
      <div role="menu">
        {items.map(item => ('type' in item
          ? (item.type === 'separator'
              ? <hr key={item.id} data-menu-separator />
              : <div key={item.id} data-menu-label>{item.text}</div>)
          : (
              <div key={item.id}>
                <button
                  type="button"
                  role="menuitem"
                  aria-current={selectedId === item.id ? 'true' : undefined}
                  onClick={() => onSelect?.(item.id)}
                >
                  {item.icon}
                  {item.label}
                </button>
                {item.submenu?.map(child => (
                  <button key={child.id} type="button" role="menuitem" onClick={() => onSelect?.(child.id)}>
                    {child.label}
                  </button>
                ))}
              </div>
            )))}
        <button type="button" data-menu-close onClick={onClose}>close</button>
      </div>
    </>
  )
}

/** Modal double exposing the title and footer while open. */
export function Modal({ open, title, description, children, footer }: {
  open: boolean
  onClose: () => void
  title: string
  closeLabel?: string
  description?: string | undefined
  children?: ReactNode
  footer?: ReactNode
}) {
  if (!open) return null
  return (
    <div role="dialog" aria-label={title}>
      <span data-dialog-title>{title}</span>
      {description === undefined ? null : <span data-dialog-description>{description}</span>}
      {children}
      {footer}
    </div>
  )
}
