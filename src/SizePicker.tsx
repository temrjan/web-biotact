import {
  useRef,
  useState,
  type KeyboardEventHandler,
  type RefObject,
} from "react";
import { basketCopy, type BasketLine } from "./Basket";
import type { Language, Product } from "./catalogue";

export default function SizePicker({
  product,
  lang,
  lines,
  dialogRef,
  onClose,
  onConfirm,
  onKeyDown,
}: {
  product: Product;
  lang: Language;
  lines: BasketLine[];
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  onConfirm: (size: string) => void | Promise<void>;
  onKeyDown: KeyboardEventHandler<HTMLDialogElement>;
}) {
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const confirming = useRef(false);
  const t = basketCopy[lang];
  const valid =
    product.is_purchasable &&
    product.is_in_stock &&
    !!selected.trim() &&
    product.available_sizes.includes(selected);
  return (
    <dialog
      ref={dialogRef}
      className="size-picker"
      aria-labelledby="size-picker-title"
      aria-describedby="size-picker-product"
      onClose={() => {
        if (!dialogRef.current?.open) onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <h2 id="size-picker-title">{t.choose}</h2>
      <p id="size-picker-product">{product.name}</p>
      <div className="size-options" role="group" aria-label={t.size}>
        {[
          ...new Set(product.available_sizes.filter((size) => size.trim())),
        ].map((size) => {
          const count = lines.find(
            (line) => line.product.id === product.id && line.size === size,
          )?.quantity;
          return (
            <button
              key={size}
              aria-pressed={selected === size}
              onClick={() => setSelected(size)}
            >
              {size}
              {count ? ` · ${count}` : ""}
            </button>
          );
        })}
      </div>
      <div className="actions">
        <button data-initial-focus onClick={onClose}>
          {t.cancel}
        </button>
        <button
          disabled={!valid || pending}
          onClick={() => {
            if (!valid || confirming.current) return;
            confirming.current = true;
            setPending(true);
            void Promise.resolve(onConfirm(selected)).finally(() => {
              confirming.current = false;
              setPending(false);
            });
          }}
        >
          {t.add}
        </button>
      </div>
    </dialog>
  );
}
