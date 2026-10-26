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
    note: "Все поля обязательны. Телефон нужен для связи, без SMS-проверки. Данные остаются только в открытой форме и удалятся при её закрытии.",
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
    note: "Barcha maydonlar majburiy. Telefon SMS-tekshiruvsiz aloqa uchun kerak. Maʼlumotlar faqat ochiq shaklda saqlanadi va u yopilganda oʻchadi.",
    review: "Maʼlumotlarni tekshirish",
    back: "Savatga qaytish",
  },
};
export function validateDetails(value: DeliveryDetails) {
  return {
    name: !value.name.trim(),
    phone: !/\d/.test(value.phone) || !/^ *\+?[\d ().-]+$/.test(value.phone),
    address: !value.address.trim(),
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
