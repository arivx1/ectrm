import {
  createContext,
  useContext,
  type HTMLAttributes,
  type RefCallback,
} from "react";

export type PromptHomeCardDragHandleProps<T extends HTMLElement = HTMLElement> =
  HTMLAttributes<T> & {
    ref?: RefCallback<T>;
    [dataAttribute: `data-${string}`]: string | undefined;
  };

const PromptHomeCardDragHandleContext =
  createContext<PromptHomeCardDragHandleProps | null>(null);

export const PromptHomeCardDragHandleProvider =
  PromptHomeCardDragHandleContext.Provider;

export function mergePromptHomeClassNames(
  ...classNames: Array<string | undefined>
): string {
  return classNames.filter(Boolean).join(" ");
}

export function usePromptHomeCardDragHandle<
  T extends HTMLElement = HTMLElement,
>(): PromptHomeCardDragHandleProps<T> {
  return (useContext(PromptHomeCardDragHandleContext) ??
    {}) as PromptHomeCardDragHandleProps<T>;
}
