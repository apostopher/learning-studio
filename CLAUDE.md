# Claude AI Rules

## CSS: Always Use Logical Properties

Never use physical direction properties. Always use logical properties so layouts work correctly in RTL locales and flow contexts.

### Replacements (physical → logical)

- `margin-left` / `margin-right` → `margin-inline-start` / `margin-inline-end` (or shorthand `margin-inline`)
- `padding-left` / `padding-right` → `padding-inline-start` / `padding-inline-end` (or `padding-inline`)
- `margin-top` / `margin-bottom` → `margin-block-start` / `margin-block-end` (or `margin-block`)
- `padding-top` / `padding-bottom` → `padding-block-start` / `padding-block-end` (or `padding-block`)
- `left` / `right` → `inset-inline-start` / `inset-inline-end` (or `inset-inline`)
- `top` / `bottom` → `inset-block-start` / `inset-block-end` (or `inset-block`)
- `border-left` / `border-right` → `border-inline-start` / `border-inline-end`
- `border-top-left-radius` etc. → `border-start-start-radius`, `border-start-end-radius`, `border-end-start-radius`, `border-end-end-radius`
- `width` / `height` → prefer `inline-size` / `block-size` when the dimension is flow-relative; plain `width`/`height` is fine for fixed visual sizing (icons, images)
- `text-align: left` / `right` → `text-align: start` / `end`
- `float: left` / `right` → `float: inline-start` / `inline-end`
- `overflow-x` / `overflow-y` → `overflow-inline` / `overflow-block`

### Tailwind

Use the logical variants by default:

- `ml-*` / `mr-*` → `ms-*` / `me-*`
- `pl-*` / `pr-*` → `ps-*` / `pe-*`
- `left-*` / `right-*` → `start-*` / `end-*`
- `border-l` / `border-r` → `border-s` / `border-e`
- `rounded-l-*` / `rounded-r-*` → `rounded-s-*` / `rounded-e-*`
- `text-left` / `text-right` → `text-start` / `text-end`

### Exceptions

Physical properties are only acceptable when the direction is genuinely tied to the viewport (e.g., a debug overlay pinned to the screen's top-left regardless of writing mode), a transform/animation along a visual axis (`translateX` for a horizontal slide effect is fine), or a third-party library's required API. Document why with a brief comment.

### Enforcement

When editing existing code that uses physical properties, convert them to logical equivalents as part of the change.

## State Management: Jotai + React Query

Always use Jotai for client state and React Query (TanStack Query) for server state. Never use useState/useReducer for complex state or manual fetch logic.

### Jotai for Client State

Use atoms for all client-side state that needs to be shared or persisted:

```ts
// atoms/user.ts
import { atom } from "jotai";

export const userPreferencesAtom = atom({
  theme: "light" as "light" | "dark",
  language: "en",
});

export const sidebarOpenAtom = atom(false);
```

**Patterns:**

- One atom per logical state unit (avoid massive state objects)
- Use `atomWithStorage` for persistence
- Derive state with computed atoms: `const derivedAtom = atom(get => get(someAtom).computed)`

### React Query for Server State

Use React Query for ALL API calls. Never use fetch/axios directly in components:

```ts
// hooks/api.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const useUser = (id: string) =>
  useQuery({
    queryKey: ["user", id],
    queryFn: () => api.getUser(id),
    staleTime: 5 * 60 * 1000, // 5min
  });

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.updateUser,
    onSuccess: (data) => {
      queryClient.setQueryData(["user", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
};
```

**Required patterns:**

- Always include `staleTime` for cacheable data
- Use `onSuccess`/`onError` in mutations to sync cache
- Invalidate related queries after mutations
- Use `enabled` for dependent queries
- Include loading/error states in components

### Component Integration

```tsx
import { useAtom } from "jotai";
import { useUser, useUpdateUser } from "@/hooks/api";
import { userPreferencesAtom } from "@/atoms/user";

export const UserProfile = ({ id }: { id: string }) => {
  const [preferences, setPreferences] = useAtom(userPreferencesAtom);
  const { data: user, isLoading, error } = useUser(id);
  const updateUser = useUpdateUser();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!user) return <NotFound />;

  return (
    <div>
      <h1>{user.name}</h1>
      <ThemeToggle
        theme={preferences.theme}
        onChange={(theme) => setPreferences((prev) => ({ ...prev, theme }))}
      />
    </div>
  );
};
```

### Setup Requirements

Always include these providers at app root:

```tsx
// App.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <YourApp />
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
);
```

### Never Use Instead

- ❌ `useState` for shared state
- ❌ `useContext` for state management
- ❌ `useEffect` for data fetching
- ❌ Manual fetch/axios in components
- ❌ Redux/Zustand (Jotai covers these use cases better)

### Package Installation

Web projects: `pnpm add jotai @tanstack/react-query @tanstack/react-query-devtools`

## UI Components: Always Use Base Components First

Strictly use base UI components from the design system. Only write custom components as a last resort when base components cannot solve the problem through composition.

### Component Selection Hierarchy (in order)

1. **Use existing base component directly** if it matches the need
2. **Compose multiple base components** to create the functionality
3. **Extend base component with additional props/styling**
4. **Write from scratch** only if above options are impossible

### Base Component Libraries by Project Type

**Web Projects:**

- Primary: Base UI (`@base-ui/react`)
- Styling: Tailwind CSS
- Icons: Lucide React (`lucide-react`)

### Decision Process

Before writing any component, ask these questions in order:

1. **Does a base component exist for this?**

```tsx
// ✅ Use base component
import { Button } from "@base-ui/react/Button";
```

1. **Can I compose base components?**

```tsx
// ✅ Compose base components
const SearchInput = () => (
  <div className="relative">
    <Input placeholder="Search..." />
    <Button className="absolute right-2 p-2">
      <Search className="h-4 w-4" />
    </Button>
  </div>
);
```

1. **Can I extend a base component?**

```tsx
// ✅ Extend with additional props
const PrimaryButton = ({ children, ...props }) => (
  <Button
    className="bg-primary hover:bg-primary/90 px-4 py-2 rounded"
    {...props}
  >
    {children}
  </Button>
);
```

1. **No other option? Document why:**

```tsx
// ✅ Custom component with justification
/**
 * Custom component required because:
 * - No base component exists for data visualization
 * - Cannot compose base components to achieve the interactive chart behavior
 * - Third-party chart library doesn't integrate with our base components
 */
const CustomChart = () => {
  // implementation
};
```

### Required Documentation for Custom Components

When writing from scratch is unavoidable, include a comment explaining:

```tsx
/**
 * Why this component exists:
 * - Checked: No base component available for [specific functionality]
 * - Checked: Cannot compose existing components to achieve [requirement]
 * - Reason: [specific technical limitation that prevents using base components]
 */
```

### Common Composition Patterns

**Modal with form:**

```tsx
// ✅ Compose: Dialog + Input + Button
import { Dialog } from "@base-ui/react/Dialog";
import { Button } from "@base-ui/react/Button";

const UserModal = () => (
  <Dialog.Root>
    <Dialog.Trigger asChild>
      <Button>Add User</Button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 bg-black/50" />
      <Dialog.Popup className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded">
        <form>
          <input className="w-full p-2 border rounded" placeholder="Name" />
          <Button type="submit" className="mt-4">
            Save
          </Button>
        </form>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
```

**Dropdown menu:**

```tsx
// ✅ Compose: Menu + Button + Icon
import { Menu } from "@base-ui/react/Menu";

const ActionsMenu = () => (
  <Menu.Root>
    <Menu.Trigger asChild>
      <Button>
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </Menu.Trigger>
    <Menu.Portal>
      <Menu.Positioner>
        <Menu.Popup className="bg-white border rounded shadow-lg">
          <Menu.Item className="px-3 py-2 hover:bg-gray-100">Edit</Menu.Item>
          <Menu.Item className="px-3 py-2 hover:bg-gray-100">Delete</Menu.Item>
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.Root>
);
```

### Base Component Sources

**Web (install these):**

```bash
pnpm add @base-ui/react
pnpm add lucide-react
```

**Common Base UI components to reach for:**

- Forms: `Button`, `Checkbox`, `RadioGroup`, `Switch`, `Slider`
- Overlays: `Dialog`, `Popover`, `Tooltip`, `Menu`
- Navigation: `Tabs`
- Feedback: `Alert`, `Progress`
- Data: `Collapsible`, `Accordion`
- Media: `NumberField`, `FieldSet`

### Base UI Import Patterns

Always import from specific component paths:

```tsx
// ✅ Correct imports
import { Button } from "@base-ui/react/Button";
import { Dialog } from "@base-ui/react/Dialog";
import { Menu } from "@base-ui/react/Menu";

// ❌ Avoid barrel imports
import { Button, Dialog } from "@base-ui/react";
```

### Styling Base UI Components

Base UI components are unstyled by default. Always add styling:

```tsx
// ✅ Add styling classes
<Button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
  Click me
</Button>

// ✅ Or use CSS-in-JS
<Button
  style={{
    backgroundColor: 'blue',
    color: 'white',
    padding: '8px 16px',
    borderRadius: '4px'
  }}
>
  Click me
</Button>
```

### Exceptions

Only acceptable to skip base components for:

- Highly specialized domain logic (custom data visualizations, unique animations)
- Performance-critical components where base component overhead is proven problematic
- Integration with third-party libraries that require specific DOM structure
- Prototyping (mark with `// TODO: replace with base components`)

### Code Review Checklist

- ❌ Custom button/input/modal without justification
- ❌ Reinventing existing patterns (dropdowns, tooltips, etc.)
- ❌ Missing styling on Base UI components
- ✅ Base UI components used where possible
- ✅ Clear composition of multiple base components
- ✅ Proper import paths (`@base-ui/react/ComponentName`)
- ✅ Justification comment for any custom components

## File Naming: Components Use Kebab-Case

Always use kebab-case for component filenames, never PascalCase.

### Component File Naming

```
✅ Correct
my-component.tsx
user-profile-card.tsx
data-table-row.tsx
search-input.tsx

❌ Wrong
MyComponent.tsx
UserProfileCard.tsx
DataTableRow.tsx
SearchInput.tsx
```

### Keep Component Names PascalCase Inside Files

The component export should still use PascalCase:

```tsx
// File: user-profile-card.tsx
export const UserProfileCard = () => {
  return <div>...</div>;
};

// File: search-input.tsx
export const SearchInput = () => {
  return <input />;
};
```

### Import/Export Patterns

```tsx
// ✅ Import from kebab-case files
import { UserProfileCard } from "./user-profile-card";
import { SearchInput } from "../components/search-input";

// ✅ Re-exports in index files
// File: components/index.ts
export { UserProfileCard } from "./user-profile-card";
export { SearchInput } from "./search-input";
```

### Directory Structure Example

```
src/
├── components/
│   ├── index.ts
│   ├── button.tsx
│   ├── user-profile-card.tsx
│   ├── search-input.tsx
│   └── data-table/
│       ├── index.ts
│       ├── data-table.tsx
│       ├── data-table-row.tsx
│       └── data-table-header.tsx
├── pages/
│   ├── home-page.tsx
│   ├── user-settings.tsx
│   └── about-page.tsx
```

### Apply to All Component Files

This applies to:

- React components (`.tsx`, `.jsx`)
- Component test files (`my-component.test.tsx`)
- Component story files (`my-component.stories.tsx`)
- Page components (`user-profile.tsx`)

### Exceptions

Non-component files can use other conventions as appropriate:

- Utilities: `camelCase.ts` or `kebab-case.ts`
- Hooks: `use-custom-hook.ts` (kebab-case preferred)
- Types: `types.ts`, `user-types.ts`
- Constants: `constants.ts`, `api-constants.ts`

## Colors: Radix Colors with WCAG AA Accessibility

Always use Radix Colors scale for consistent, accessible color pairing. All color combinations must meet WCAG AA standards (4.5:1 contrast ratio for normal text, 3:1 for large text).

### Color System Requirements

**Primary:** Radix Colors (`@radix-ui/colors`)
**Accessibility:** WCAG AA minimum (4.5:1 contrast ratio)
**Utility:** Use `colors.ts` utility for custom scale generation
**Integration:** Tailwind CSS custom colors

### Installation & Setup

```bash
pnpm add @radix-ui/colors
```

### Using colors.ts Utility

Always use the `colors.ts` utility to generate custom Radix color . it has a `generateRadixColors` function that generates the colors for the current theme:

```ts
// Usage in components
import { generateRadixColors } from "./colors";
const blue = generateRadixColors({});
```

### Accessible Color Pairing Rules

**Text on Background:**

```tsx
// ✅ WCAG AA compliant pairings
<div className="bg-gray-1 text-gray-12">Light background, dark text</div>
<div className="bg-gray-12 text-gray-1">Dark background, light text</div>

// ✅ Semantic color pairing
<div className="bg-red-3 text-red-11">Error state</div>
<div className="bg-green-3 text-green-11">Success state</div>
<div className="bg-blue-3 text-blue-11">Info state</div>

// ❌ Poor contrast - avoid
<div className="bg-gray-3 text-gray-6">Insufficient contrast</div>
<div className="bg-blue-4 text-blue-7">Poor readability</div>
```

### Radix Colors Scale Usage

**Step Guidelines:**

- Steps 1-2: Backgrounds, subtle borders
- Steps 3-5: UI backgrounds, hover states
- Steps 6-8: Borders, separators
- Steps 9-10: Interactive elements (solid backgrounds)
- Steps 11-12: Text, high contrast elements

```tsx
// ✅ Correct scale usage
const Button = ({ variant = "primary" }) => {
  if (variant === "primary") {
    return (
      <button className="bg-blue-9 hover:bg-blue-10 text-white">
        Primary Button
      </button>
    );
  }

  if (variant === "secondary") {
    return (
      <button className="bg-gray-3 hover:bg-gray-4 text-gray-12 border border-gray-7">
        Secondary Button
      </button>
    );
  }
};
```

### Semantic Color Assignment

```ts
// colors.ts - Define semantic colors using Radix scales
export const semanticColors = {
  // Status colors
  success: {
    bg: "green-3",
    border: "green-7",
    text: "green-11",
    solid: "green-9",
  },
  error: {
    bg: "red-3",
    border: "red-7",
    text: "red-11",
    solid: "red-9",
  },
  warning: {
    bg: "amber-3",
    border: "amber-7",
    text: "amber-11",
    solid: "amber-9",
  },
  info: {
    bg: "blue-3",
    border: "blue-7",
    text: "blue-11",
    solid: "blue-9",
  },

  // UI colors
  primary: {
    bg: "blue-3",
    border: "blue-7",
    text: "blue-11",
    solid: "blue-9",
  },
  neutral: {
    bg: "gray-3",
    border: "gray-7",
    text: "gray-12",
    solid: "gray-9",
  },
};
```

### Tailwind Integration

Configure Tailwind to use Radix Colors:

```css
@import "tailwindcss";
@theme {
  --color-gray-1: #121063;
  --color-gray-2: #3ab7bf;
  --color-gray-3: #78dcca;
}
```

### Component Color Patterns

```tsx
// ✅ Alert component with accessible colors
const Alert = ({ variant, children }) => {
  const styles = {
    success: "bg-green-3 border-green-7 text-green-11",
    error: "bg-red-3 border-red-7 text-red-11",
    warning: "bg-amber-3 border-amber-7 text-amber-11",
    info: "bg-blue-3 border-blue-7 text-blue-11",
  };

  return (
    <div className={`p-4 border rounded ${styles[variant]}`}>{children}</div>
  );
};

// ✅ Card with proper contrast
const Card = ({ children }) => (
  <div className="bg-gray-2 border border-gray-6 text-gray-12 rounded-lg p-6">
    {children}
  </div>
);
```

### Theme Support

Use the `generateRadixColors` utility to generate the colors for the current theme.

### Testing Color Contrast

Always verify WCAG AA compliance:

```ts
// colors.ts - Include contrast checking
export const checkContrast = (foreground: string, background: string) => {
  const ratio = new Color(foreground).contrastWCAG21(new Color(background));
  return {
    wcagAA: ratio >= 4.5,
    wcagAALarge: ratio >= 3.0,
    ratio,
  };
};
```

### Required Practices

**Do:**

- Use colors.ts utility for all color generation
- Test color combinations in both light and dark modes
- Use semantic color names (success, error, warning, info)
- Follow Radix Colors step guidelines for appropriate usage
- Verify WCAG AA compliance for all text/background combinations

**Don't:**

- Use arbitrary colors outside the Radix Colors system
- Mix different color systems with Radix Colors
- Use steps 1-8 for text colors (insufficient contrast)
- Use steps 9-12 for subtle backgrounds
- Skip contrast verification for custom color combinations

### Code Review Checklist

- ✅ All colors use Radix Colors scale
- ✅ colors.ts utility used for custom scales
- ✅ WCAG AA contrast ratios verified
- ✅ Semantic color names used appropriately
- ✅ Proper scale steps used for intended purpose
- ❌ Arbitrary hex/rgb colors
- ❌ Poor contrast combinations
- ❌ Mixed color systems
