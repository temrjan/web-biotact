import { useState, type FormEvent } from "react";
import type { Language } from "./catalogue";
import "./home.css";

const VIDEO_ID = "MaA4Rtf9ZXA";
const PHONE = { href: "tel:+998935551747", text: "+998 93 555 17 47" };

/* FAQ texts are copied exactly from the Mini App i18n files (faq.*). */
const faq = {
  ru: {
    title: "Вопрос-ответ",
    items: [
      [
        "Что делает продукцию BIOTACT DEUTSCHLAND уникальной на рынке?",
        "BIOTACT DEUTSCHLAND выделяется благодаря инновационным формулам, сочетающим высококачественные натуральные ингредиенты с последними научными достижениями. Это обеспечивает нашей продукции непревзойденное качество и эффективность для поддержки вашего здоровья, гарантируя вам только лучшее.",
      ],
      [
        "Как мы гарантируем превосходное немецкое качество наших продуктов?",
        "Продукция BIOTACT DEUTSCHLAND производится по лицензии в соответствии с международными стандартами ISO 9001 и ISO 22000 (HACCP). Производство сертифицировано немецким органом TÜV Thüringen, имеет собственную аттестованную лабораторию и работает по стандартам качества, заложенным в Германии.",
      ],
      [
        "Какова история успеха BIOTACT DEUTSCHLAND на рынке?",
        "BIOTACT DEUTSCHLAND имеет многолетний опыт на рынке как надежный производитель высококачественных пробиотиков и витаминно-минеральных комплексов. Мы завоевали доверие потребителей благодаря нашему постоянному стремлению к инновациям и фокусу на клиентских потребностях. Наша продукция известна на рынке более 19 лет, с более чем 8 миллионами проданных упаковок и миллионами довольных клиентов.",
      ],
      [
        "Какие уникальные преимущества у наших пробиотиков и витаминно-минеральных комплексов?",
        "Наши продукты уникальны благодаря сочетанию передовых научных разработок с натуральными компонентами. Они гипоаллергенны, не содержат искусственных добавок и подходят для всех, включая беременных, кормящих, детей, пожилых, аллергиков и диабетиков.",
      ],
      [
        "Подтверждена ли сертификация нашей продукции?",
        "Да, продукция BIOTACT DEUTSCHLAND полностью сертифицирована. Производство сертифицировано немецким органом TÜV Thüringen по международным стандартам ISO 9001 и ISO 22000 (HACCP), гарантирующим высокое качество и безопасность наших продуктов.",
      ],
      [
        "Где можно приобрести нашу продукцию?",
        'Вы можете приобрести нашу продукцию в аптеках, "Uzum Market", магазинах "Kid Point", а также на нашем официальном сайте. Мы предлагаем широкий ассортимент продукции и полную информацию о них, а наш Call-center всегда готов помочь вам с консультациями по телефону +998 93 555 17 47',
      ],
    ],
  },
  uz: {
    title: "Savol-javob",
    items: [
      [
        "BIOTACT DEUTSCHLAND mahsulotlarini bozorda nima noyob qiladi?",
        "BIOTACT DEUTSCHLAND yuqori sifatli tabiiy ingrediyentlarni so'nggi ilmiy yutuqlar bilan birlashtiradigan innovatsion formulalar bilan ajralib turadi. Bu bizning mahsulotlarimizga sog'ligingizni qo'llab-quvvatlash uchun tengsiz sifat va samaradorlikni ta'minlaydi, sizga faqat eng yaxshisini kafolatlaydi.",
      ],
      [
        "Biz mahsulotlarimizning ajoyib nemis sifatiga qanday kafolat beramiz?",
        "BIOTACT DEUTSCHLAND mahsulotlari ISO 9001 va ISO 22000 (HACCP) xalqaro standartlariga muvofiq litsenziya asosida ishlab chiqariladi. Ishlab chiqarish nemis organi TÜV Thüringen tomonidan sertifikatlangan, o'zining attestatsiyalangan laboratoriyasiga ega va Germaniyada belgilangan sifat standartlari bo'yicha ishlaydi.",
      ],
      [
        "BIOTACT DEUTSCHLAND ning bozordagi muvaffaqiyat tarixi qanday?",
        "BIOTACT DEUTSCHLAND yuqori sifatli probiotiklar va vitamin-mineral komplekslarining ishonchli ishlab chiqaruvchisi sifatida bozorda ko'p yillik tajribaga ega. Biz innovatsiyalarga doimiy intilishimiz va mijozlar ehtiyojlariga e'tibor qaratishimiz tufayli iste'molchilar ishonchini qozondik. Bizning mahsulotlarimiz bozorda 19 yildan ortiq vaqt davomida tanilgan, 8 milliondan ortiq qadoq sotilgan va millionlab mamnun mijozlarga ega.",
      ],
      [
        "Bizning probiotiklar va vitamin-mineral komplekslarimizning noyob afzalliklari qanday?",
        "Bizning mahsulotlarimiz ilg'or ilmiy ishlanmalar bilan tabiiy komponentlarning uyg'unligida noyobdir. Ular gipoallergen, sun'iy qo'shimchalarsiz va hamma uchun, shu jumladan homilador, emizikli onalar, bolalar, keksalar, allergiklar va diabetiklar uchun mos keladi.",
      ],
      [
        "Mahsulotlarimizning sertifikatsiyasi tasdiqlanganmi?",
        "Ha, BIOTACT DEUTSCHLAND mahsulotlari to'liq sertifikatlangan. Ishlab chiqarish nemis organi TÜV Thüringen tomonidan ISO 9001 va ISO 22000 (HACCP) xalqaro standartlari bo'yicha sertifikatlangan bo'lib, mahsulotlarimizning yuqori sifati va xavfsizligini kafolatlaydi.",
      ],
      [
        "Mahsulotlaringizni qayerdan sotib olish mumkin?",
        'Siz mahsulotlarimizni dorixonalarda, "Uzum Market"da, "Kid Point" do\'konlarida, shuningdek, rasmiy veb-saytimizdan sotib olishingiz mumkin. Biz keng assortimentdagi mahsulotlar va ular haqida to\'liq ma\'lumot taklif qilamiz, Call-markazimiz esa sizga +998 93 555 17 47 telefon raqami orqali maslahatlar berishga doim tayyor.',
      ],
    ],
  },
} as const;

const copy = {
  ru: {
    video: "Пробиотики и витаминно-минеральные комплексы",
    play: "Смотреть видео",
    player: "Видео BIOTACT DEUTSCHLAND на YouTube",
    consultation:
      "Получите бесплатную консультацию по нашей продукции от специалиста",
    name: "Ваше имя",
    phone: "Телефон",
    question: "Ваш вопрос",
    submit: "Получить консультацию",
    notice: "Форма скоро заработает. Позвоните нам:",
    phoneLabel: "Тел.:",
    address: [
      "100109, Республика Узбекистан, г. Ташкент,",
      "Алмазарский район, ул. Фаробий, 448J",
    ],
    contacts: "Контакты",
    credit: "Разработка сайта —",
    company: 'ООО "Biotact"',
  },
  uz: {
    video: "Probiotiklar va vitamin-mineral komplekslar",
    play: "Videoni ko'rish",
    player: "BIOTACT DEUTSCHLAND videosi YouTube'da",
    consultation:
      "Bizning mutaxassisimizdan mahsulotlarimiz bo'yicha bepul maslahat oling",
    name: "Sizning ismingiz",
    phone: "Telefon",
    question: "Sizning savolingiz",
    submit: "Maslahat olish",
    notice: "Shakl tez orada ishga tushadi. Bizga qo'ng'iroq qiling:",
    phoneLabel: "Tel.:",
    address: [
      "100109, Toshkent shahri, Olmazor tumani,",
      "Farobiy ko'chasi, 448J",
    ],
    contacts: "Kontaktlar",
    credit: "Sayt ishlab chiqilgan:",
    company: '"Biotact" MChJ',
  },
};

/** Click-to-play preview: no YouTube frame loads before the visitor asks for it. */
export function VideoPlayer({
  videoId,
  label,
  frameTitle,
}: {
  videoId: string;
  label: string;
  frameTitle: string;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="video-frame">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
          title={frameTitle}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          // The page sends no referrer; YouTube refuses embeds without the origin.
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className="video-preview"
          aria-label={label}
          onClick={() => setPlaying(true)}
        >
          <img
            src={`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`}
            alt=""
            loading="lazy"
            decoding="async"
          />
          <span className="video-play" aria-hidden="true">
            ▶
          </span>
        </button>
      )}
    </div>
  );
}

export function Video({ lang }: { lang: Language }) {
  const t = copy[lang];
  return (
    <section className="home-section home-video" aria-labelledby="home-video">
      <h2 id="home-video">{t.video}</h2>
      <VideoPlayer
        videoId={VIDEO_ID}
        label={`${t.play}: ${t.video}`}
        frameTitle={t.player}
      />
    </section>
  );
}

/** Mini App questions; one answer is open at a time, as in the Mini App. */
export function Faq({ lang }: { lang: Language }) {
  const t = faq[lang];
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="home-section faq" aria-labelledby="home-faq">
      <h2 id="home-faq">{t.title}</h2>
      <div className="faq-list">
        {t.items.map(([question, answer], index) => (
          <div className="faq-item" key={index}>
            <h3>
              <button
                type="button"
                id={`faq-question-${index}`}
                aria-expanded={open === index}
                aria-controls={`faq-answer-${index}`}
                onClick={() => setOpen(open === index ? null : index)}
              >
                <span>{question}</span>
                <span className="faq-icon" aria-hidden="true">
                  {open === index ? "−" : "+"}
                </span>
              </button>
            </h3>
            <div
              id={`faq-answer-${index}`}
              role="region"
              aria-labelledby={`faq-question-${index}`}
              hidden={open !== index}
            >
              <p>{answer}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Presentation mock-up: input stays in the page and no request is made. */
export function Consultation({ lang }: { lang: Language }) {
  const t = copy[lang];
  const [notice, setNotice] = useState(false);
  return (
    <section
      className="home-section consultation"
      aria-labelledby="home-consultation"
    >
      <h2 id="home-consultation">{t.consultation}</h2>
      <form
        className="consultation-form"
        noValidate
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          setNotice(true);
        }}
      >
        <div className="guest-field">
          <label htmlFor="consultation-name">{t.name}</label>
          <input id="consultation-name" name="name" autoComplete="off" />
        </div>
        <div className="guest-field">
          <label htmlFor="consultation-phone">{t.phone}</label>
          <div className="phone-input">
            <span aria-hidden="true">+998</span>
            <input
              id="consultation-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="00-000-0000"
              aria-describedby="consultation-phone-code"
            />
            <span className="hero-sr-only" id="consultation-phone-code">
              +998
            </span>
          </div>
        </div>
        <div className="guest-field consultation-question">
          <label htmlFor="consultation-question">{t.question}</label>
          <textarea id="consultation-question" name="question" rows={3} />
        </div>
        <button type="submit" className="consultation-submit">
          {t.submit}
        </button>
        <p className="consultation-notice" role="status">
          {notice && (
            <>
              {t.notice} <a href={PHONE.href}>{PHONE.text}</a>
            </>
          )}
        </p>
      </form>
    </section>
  );
}

/** Mini App footer contacts with the Uzbekistan legal address, then copyright and credit. */
export function CompanyFooter({ lang }: { lang: Language }) {
  const t = copy[lang];
  return (
    <footer className="page-footer" aria-label={t.contacts}>
      <div className="footer-companies">
        <section aria-labelledby="footer-uz">
          <h2 id="footer-uz">{t.company}</h2>
          {t.address.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p>
            {t.phoneLabel} <a href="tel:+998935551747">(+998 93) 555 17 47</a>
          </p>
          <p>
            E-Mail:{" "}
            <a href="mailto:contact_uz@biotact.de">contact_uz@biotact.de</a>
          </p>
        </section>
        <section aria-labelledby="footer-de">
          <h2 id="footer-de">Biotact Deutschland GmbH</h2>
          <p>Siemensstraße 10</p>
          <p>53121 Bonn, Deutschland</p>
          <p>
            Tel.: <a href="tel:+4902285048084">+49 (0) 228 50 48 80 84</a>
          </p>
          <p>
            E-Mail: <a href="mailto:kontakt@biotact.de">kontakt@biotact.de</a>
          </p>
        </section>
      </div>
      <div className="footer-bottom">
        <p>
          © {new Date().getFullYear()} {t.company}
        </p>
        <p>
          {t.credit}{" "}
          <a
            href="https://temrjan.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            temrjan.com
          </a>
        </p>
      </div>
    </footer>
  );
}
