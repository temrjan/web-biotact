import { useRef, useState } from "react";
import type { Language } from "./catalogue";

export interface DeliveryDetails {
  name: string;
  phone: string;
  address: string;
}
export const detailsCopy = {
  ru: {
    title: "Данные для доставки",
    name: "Имя",
    phone: "Контактный телефон",
    address: "Адрес доставки",
    required: "Заполните это поле.",
    invalidPhone:
      "Укажите телефон с цифрами. Допустимы пробелы, скобки, дефисы, точки и плюс в начале.",
    note: "Все поля обязательны. Телефон нужен для связи по заказу, без SMS-проверки. Данные будут переданы продавцу вместе с заказом.",
    review: "Проверить данные",
    back: "Назад в корзину",
  },
  uz: {
    title: "Yetkazib berish maʼlumotlari",
    name: "Ism",
    phone: "Aloqa telefoni",
    address: "Yetkazib berish manzili",
    required: "Bu maydonni toʻldiring.",
    invalidPhone:
      "Raqamli telefon kiriting. Boʻshliq, qavs, chiziqcha, nuqta va boshida plyus mumkin.",
    note: "Barcha maydonlar majburiy. Telefon buyurtma boʻyicha aloqa uchun kerak, SMS-tekshiruvsiz. Maʼlumotlar buyurtma bilan birga sotuvchiga yuboriladi.",
    review: "Maʼlumotlarni tekshirish",
    back: "Savatga qaytish",
  },
};
/** Field limits of the guest order request (spec S2 OC-02), counted in code points after trimming. */
export const DETAIL_LIMITS = { name: 100, phone: 20, address: 300 };
const length = (value: string) => [...value].length;
function control(value: string, allowed = "") {
  for (const c of value) {
    const n = c.charCodeAt(0);
    if ((n < 0x20 || (n >= 0x7f && n <= 0x9f)) && !allowed.includes(c))
      return true;
  }
  return false;
}
export function validateDetails(value: DeliveryDetails) {
  const name = value.name.trim(),
    phone = value.phone.trim(),
    address = value.address.trim(),
    digits = phone.replace(/[^0-9]/g, "").length;
  return {
    name: !name || length(name) > DETAIL_LIMITS.name || control(name),
    phone:
      length(phone) > DETAIL_LIMITS.phone ||
      !/^\+?[0-9 ().-]+$/.test(phone) ||
      digits < 9 ||
      digits > 15,
    address:
      !address ||
      length(address) > DETAIL_LIMITS.address ||
      control(address, "\r\n"),
  };
}
export default function GuestDetails({
  lang,
  value,
  onChange,
  onReview,
  onBack,
  available,
}: {
  lang: Language;
  value: DeliveryDetails;
  onChange: (value: DeliveryDetails) => void;
  onReview: () => void;
  onBack: () => void;
  available: boolean;
}) {
  const t = detailsCopy[lang];
  const [errors, setErrors] = useState({
    name: false,
    phone: false,
    address: false,
  });
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      className="guest-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const next = validateDetails(value);
        setErrors(next);
        const first = (["name", "phone", "address"] as const).find(
          (key) => next[key],
        );
        if (first)
          form.current
            ?.querySelector<HTMLElement>(`[name="${first}"]`)
            ?.focus();
        else if (available) onReview();
      }}
    >
      <p className="basket-note">{t.note}</p>
      {(["name", "phone", "address"] as const).map((key) => {
        const props = {
          id: `guest-${key}`,
          name: key,
          value: value[key],
          required: true,
          autoComplete: "off",
          ...(key === "phone" ? {} : { maxLength: DETAIL_LIMITS[key] }),
          "aria-invalid": errors[key],
          "aria-describedby": errors[key] ? `guest-${key}-error` : undefined,
          onChange: (
            event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
          ) => onChange({ ...value, [key]: event.target.value }),
        };
        return (
          <div className="guest-field" key={key}>
            <label htmlFor={props.id}>{t[key]}</label>
            {key === "address" ? (
              <textarea {...props} rows={3} />
            ) : (
              <input {...props} type={key === "phone" ? "tel" : "text"} />
            )}
            {errors[key] && (
              <p className="guest-error" id={`guest-${key}-error`}>
                {key === "phone" ? t.invalidPhone : t.required}
              </p>
            )}
          </div>
        );
      })}
      <div className="guest-actions">
        <button type="button" onClick={onBack}>
          {t.back}
        </button>
        <button type="submit" disabled={!available}>
          {t.review}
        </button>
      </div>
    </form>
  );
}
