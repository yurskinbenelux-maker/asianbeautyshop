# Russian translation audit — messages/ru.json

Each finding has the format:

```
KEY        path.to.key
NOW        current Russian text
FIX        proposed Russian text
WHY        one-line reason
```

**How to use this doc:**

1. Read top-down, delete any FIX you reject (or modify it in place).
2. When you're happy with what's left, send the file back to me.
3. I apply every remaining FIX to `messages/ru.json` in one pass.

If you want to keep a string as-is, just delete the whole block (the four lines).

---

## 0 · Big pattern: `рутина` is feminine

`рутина` (ru-utin-a) is a **feminine** noun in Russian. The English source string "ritual" is genderless, and the translator treated it as masculine ("Ваш рутина", "корейский рутина") in 20+ places. Every one of those is grammatically wrong.

Two paths to fix it:

- **Path A (safe / minimal):** keep the noun `рутина`, agree its modifiers in feminine. e.g. "Ваш рутина" → "Ваша рутина", "корейский рутина" → "корейская рутина", "Добавить в рутина" → "Добавить в рутину" (accusative).
- **Path B (alternative):** replace `рутина` with `ритуал` (masculine) — matches the brand voice of "ritual" and avoids confusing readers familiar with the English. Then "Ваш ритуал", "корейский ритуал". Fewer agreement changes overall.

**Tell me which path you prefer.** All my FIX entries below assume Path A. If you want Path B, just write "PATH B" at the top of the file when you send it back and I'll convert.

Findings are grouped below as 0-A (all the рутина gender fixes — same pattern, listed in one block) and then 1, 2, 3… for everything else.

---

## 0-A · `рутина` gender fixes (Path A — feminine agreement)

```
KEY        section.ritual
NOW        Ваш рутина
FIX        Ваша рутина
WHY        feminine noun
```

```
KEY        section.ritual_lede
NOW        Четыре шага, утром и вечером — подобрано нами, собрано вами.
FIX        Четыре шага, утром и вечером — подобраны нами, собраны вами.
WHY        plural agreement (шаги)
```

```
KEY        section.testimonials_lede
NOW        Письма от тех, кто тихо сопровождает наши рутины каждый день.
FIX        (keep — already correct plural)
WHY        already correct; included only to confirm
```

```
KEY        hero.lede
NOW        Создан для чувствительной кожи, предназначен для ежедневного рутины.
FIX        Создан для чувствительной кожи, предназначен для ежедневной рутины.
WHY        ежедневной (gen. fem.), not ежедневного
```

```
KEY        rituals.meta_description
NOW        Корейский рутина в четыре шага — очищение, уход, увлажнение, защита.
FIX        Корейская рутина в четыре шага — очищение, уход, увлажнение, защита.
WHY        feminine noun
```

```
KEY        rituals.lede
NOW        Рутина намеренно короток — четыре осмысленных момента…
FIX        Рутина намеренно короткая — четыре осмысленных момента…
WHY        feminine adj.
```

```
KEY        rituals.cta_quiz
NOW        Собрать мой рутина
FIX        Собрать мою рутину
WHY        feminine + accusative
```

```
KEY        rituals.closing_title
NOW        Соберём рутина вместе.
FIX        Соберём рутину вместе.
WHY        accusative case
```

```
KEY        product.add_to_ritual
NOW        Добавить в рутина
FIX        Добавить в рутину
WHY        accusative case
```

```
KEY        product.how_to_use
NOW        Рутина
FIX        (keep — single word, gender doesn't apply here)
WHY        OK as standalone label
```

```
KEY        product.bundle_eyebrow
NOW        Дополните рутина
FIX        Дополните рутину
WHY        accusative case
```

```
KEY        cart.drawer_title
NOW        Ваш рутина
FIX        Ваша рутина
WHY        feminine
```

```
KEY        cart.empty_lede
NOW        Выберите очищение, эссенцию, бальзам — начните рутина.
FIX        Выберите очищение, эссенцию, бальзам — начните рутину.
WHY        accusative
```

```
KEY        cart.added_toast
NOW        Добавлено в ваш рутина.
FIX        Добавлено в вашу рутину.
WHY        feminine + accusative
```

```
KEY        checkout.success_cta_shop
NOW        Продолжить рутина
FIX        Продолжить рутину
WHY        accusative
```

```
KEY        concierge.mode_quiz_hint
NOW        Несколько коротких вопросов — и мы составим персональный рутина из 4 шагов.
FIX        Несколько коротких вопросов — и мы составим персональную рутину из 4 шагов.
WHY        feminine + accusative
```

```
KEY        concierge.quiz_building
NOW        Составляем ваш рутина…
FIX        Составляем вашу рутину…
WHY        feminine + accusative
```

```
KEY        concierge.quiz_error
NOW        Не удалось составить рутина. Попробуйте ещё раз через мгновение.
FIX        Не удалось составить рутину. Попробуйте ещё раз через мгновение.
WHY        accusative
```

```
KEY        concierge.result_eyebrow
NOW        Ваш рутина
FIX        Ваша рутина
WHY        feminine
```

```
KEY        concierge.result_add_full_ritual
NOW        Добавить весь рутина
FIX        Добавить всю рутину
WHY        feminine + accusative
```

```
KEY        account.orders_empty_body
NOW        Загляните в наш магазин, чтобы собрать свой рутина ухода. Заказы появятся здесь после оформления.
FIX        Загляните в наш магазин, чтобы собрать свою рутину ухода. Заказы появятся здесь после оформления.
WHY        feminine + accusative
```

```
KEY        contact.response_body
NOW        … укажите номер заказа (начинается с ABS-), и мы найдём ваш рутина сразу.
FIX        … укажите номер заказа (начинается с ABS-), и мы найдём вашу рутину сразу.
WHY        feminine + accusative
```

```
KEY        seo.home.description
NOW        … рассчитан на ежедневный рутина.
FIX        … рассчитана на ежедневную рутину.
WHY        adj. agrees with implied "уход" (masc.) earlier; safest is rewrite. Alternative: "рассчитан на ежедневное использование."
```

```
KEY        seo.shop.description
NOW        … соберите свой рутина.
FIX        … соберите свою рутину.
WHY        accusative
```

```
KEY        search.page_description
NOW        Найдите свой рутина — поиск по товарам, брендам и ингредиентам.
FIX        Найдите свою рутину — поиск по товарам, брендам и ингредиентам.
WHY        accusative
```

```
KEY        search.empty_body
NOW        Найдите свой рутина — поиск по товарам, брендам и ингредиентам.
FIX        Найдите свою рутину — поиск по товарам, брендам и ингредиентам.
WHY        accusative
```

```
KEY        search.ritual_protect_body
NOW        Ежедневный SPF и уход за барьером — завершение рутины.
FIX        (keep — gen. case is correct here)
WHY        already correct
```

---

## 1 · Other awkward phrasings — product page

```
KEY        product.related
NOW        Носить с
FIX        Сочетается с
WHY        "wear with" is odd for skincare; "pairs with" / "сочетается с" is the natural Russian for cosmetic bundling
```

```
KEY        product.best_for_label
NOW        Решает
FIX        Помогает с
WHY        "Решает" alone reads abrupt; "Помогает с" is softer and matches the brand's calm tone
```

```
KEY        product.details_audience
NOW        Аудитория
FIX        Для кого
WHY        "Аудитория" is corporate; "Для кого" matches a beauty-care reading audience
```

```
KEY        product.reviews_none_body
NOW        Будьте первой, кто поделится впечатлениями.
FIX        Будьте первой(-ым), кто поделится впечатлениями.
WHY        defaults to female reader; the (-ым) parenthetical includes male readers. Or pick gender-neutral: "Поделитесь впечатлениями первыми."
```

```
KEY        product.bundle_title
NOW        Прекрасно сочетается с
FIX        (keep — natural Russian)
WHY        OK
```

---

## 2 · Quiz + concierge naming inconsistency

The site uses two different words for the same feature:

- `nav.skin_quiz` = "Тест для кожи"
- `quizPage.eyebrow` = "Тест для кожи"
- `concierge.mode_quiz_label` = "КВИЗ"
- `concierge.mode_quiz_title` = "Пройдите квиз по коже"
- `concierge.quiz_retake` = "Пройти квиз заново"

The customer-facing page calls it "тест", the concierge popup calls it "квиз" — these are the same feature.

```
KEY        concierge.mode_quiz_label
NOW        КВИЗ
FIX        ТЕСТ
WHY        match the main nav label "Тест для кожи"
```

```
KEY        concierge.mode_quiz_title
NOW        Пройдите квиз по коже
FIX        Пройдите тест для кожи
WHY        match the main page wording
```

```
KEY        concierge.quiz_retake
NOW        Пройти квиз заново
FIX        Пройти тест заново
WHY        consistency
```

(If you actually prefer "квиз" as a younger, more casual word, swap the OTHER references to "квиз" instead. The point is to pick one.)

---

## 3 · Cart + checkout small polish

```
KEY        cart.empty_title
NOW        Ваша корзина тиха.
FIX        Ваша корзина пуста.
WHY        "тиха" is too poetic for a UI state label; "пуста" is the standard
```

```
KEY        cart.summary_subtotal
NOW        Подытог
FIX        Промежуточный итог
WHY        "Подытог" is technically correct but rare in Russian; "Промежуточный итог" matches Wildberries / Ozon convention. (Note: cart.subtotal already uses this — sync.)
```

```
KEY        checkout.summary_subtotal
NOW        Подытог
FIX        Промежуточный итог
WHY        same reason as cart
```

```
KEY        checkout.field_country_hint
NOW        Двухбуквенный код страны — BE, NL, FR, DE, LU.
FIX        (keep)
WHY        OK
```

```
KEY        checkout.success_pending_title
NOW        Подтверждаем оплату.
FIX        Подтверждаем вашу оплату.
WHY        "вашу" adds a small warmth — matches "Ваш заказ в пути" tone
```

---

## 4 · Account / privacy

```
KEY        account.nav_privacy
NOW        Приватность
FIX        Конфиденциальность
WHY        "Приватность" is an anglicism; "Конфиденциальность" is the legal Russian term (also used in footer.privacy already — sync)
```

```
KEY        account.greeting
NOW        С возвращением, {name}.
FIX        (keep)
WHY        natural
```

```
KEY        privacy.title
NOW        Ваши данные — ваш выбор
FIX        (keep)
WHY        good
```

```
KEY        privacy.delete_lede
NOW        Мы сразу отметим ваш аккаунт на удаление, выйдем из сессии и окончательно обезличим ваши личные данные через {days} дней.
FIX        Мы сразу пометим ваш аккаунт на удаление, выйдем из сессии и окончательно обезличим ваши личные данные через {days} дней.
WHY        "пометим" is the right verb here ("mark for"); "отметим" reads slightly off
```

---

## 5 · Returns

```
KEY        returns.reason.CHANGED_MIND
NOW        Передумал(а)
FIX        (keep — gender-inclusive form OK)
WHY        good
```

```
KEY        returns.reason.ALLERGIC_REACTION
NOW        Была реакция кожи
FIX        Была аллергическая реакция
WHY        the English source is "Allergic reaction" — current Russian softens it to "skin reaction" which is too vague for an allergy claim
```

```
KEY        returns.form_lede
NOW        Укажите, что вы хотели бы вернуть и почему. Мы читаем каждую заявку лично и отвечаем в течение одного рабочего дня.
FIX        (keep)
WHY        warm and clear
```

---

## 6 · Hero + homepage sections

```
KEY        hero.title_pre / title_kr / title_post
NOW        Первый / 첫 / жест спокойной кожи
FIX        (keep, but verify with native)
WHY        the mix of Russian + Korean character + Russian works on the visual hero, but check if "первый жест спокойной кожи" reads as natural ad copy in Russian. Could simplify to: title_pre="" / title_post="Первый жест спокойной кожи"
```

```
KEY        hero.eyebrow
NOW        Новое — весенняя коллекция
FIX        Новинка — весенняя коллекция
WHY        "Новое" is neutral; "Новинка" is the standard retail label
```

```
KEY        announcement.yurclub
NOW        Получайте баллы за каждый заказ — вступите в A-Beauty Club бесплатно. Зарегистрируйтесь, чтобы начать
FIX        Получайте баллы за каждый заказ — вступайте в A-Beauty Club бесплатно. Зарегистрируйтесь, чтобы начать.
WHY        verb aspect: "вступите" (perfective) → "вступайте" (imperative, ongoing invitation); also add final period for consistency
```

---

## 7 · Concierge intro copy

```
KEY        concierge.greeting
NOW        Помогу вам с выбором. Спросите меня про ингредиенты, рутины или любые потребности кожи.
FIX        Помогу вам с выбором. Спросите меня про ингредиенты, рутины или любые вопросы о коже.
WHY        "потребности кожи" reads like dermatology jargon; "вопросы о коже" matches the casual chat tone
```

```
KEY        concierge.mode_chat_hint
NOW        Свободный разговор об ингредиентах, ритуалах и особенностях кожи.
FIX        (keep)
WHY        good
```

```
KEY        concierge.chat_greeting
NOW        Привет — я ваш консьерж по уходу. Спросите что угодно.
FIX        (keep)
WHY        natural and friendly
```

---

## 8 · Search empty state

```
KEY        search.no_results
NOW        Ничего не найдено. Попробуйте бренд, ингредиент или задачу.
FIX        Ничего не найдено. Попробуйте поискать по бренду, ингредиенту или задаче.
WHY        "Попробуйте бренд" reads as "try a brand" — instrumental case fix
```

---

## 9 · Loyalty / A-Beauty Club

```
KEY        yur_club.points_to_next
NOW        Заработайте {count, number} баллов до уровня {next}
FIX        До уровня {next} осталось {count, number} баллов
WHY        more natural Russian word order; "Заработайте" sounds like a command
```

```
KEY        yur_club.tile_redeem_sub
NOW        Обменивайте баллы на товары и скидки.
FIX        (keep)
WHY        OK
```

```
KEY        yur_club.refer_terms
NOW        Обе награды приходят автоматически. Купоны нельзя объединять в одном заказе — идеальный повод вернуться второй раз.
FIX        Обе награды начисляются автоматически. Купоны нельзя объединять в одном заказе — идеальный повод вернуться ещё раз.
WHY        "приходят" → "начисляются" (more accurate for points); "второй раз" → "ещё раз" reads warmer
```

---

## 10 · Journal + contact small polish

```
KEY        journal.title
NOW        Заметки из мастерской.
FIX        (keep)
WHY        natural, evocative
```

```
KEY        journal.empty_body
NOW        Мы собираем вступительные очерки — один о женьшене, другой о лунной вазе Чосон, третий о первом жесте утра.
FIX        (keep — but verify "лунной вазе Чосон" is the brand-correct phrasing you want for Moon Jar)
WHY        unsure if brand uses "лунная ваза" or "лунный кувшин" — both exist in Russian
```

```
KEY        contact.response_body
NOW        Стараемся ответить в течение двух рабочих дней. Если вопрос по заказу — укажите номер заказа (начинается с ABS-), и мы найдём ваш рутина сразу.
FIX        Стараемся ответить в течение двух рабочих дней. Если вопрос по заказу — укажите номер заказа (начинается с ABS-), и мы найдём вашу рутину сразу.
WHY        same рутина gender fix (already in section 0-A)
```

---

## 11 · Cookie consent

```
KEY        consent.eyebrow
NOW        Несколько слов о cookie
FIX        (keep)
WHY        natural
```

```
KEY        consent.title
NOW        Осознанное использование cookie
FIX        (keep)
WHY        matches brand's mindful tone
```

```
KEY        consent.cat.necessary.description
NOW        Нужны для работы сайта — корзина, язык, безопасность. Всегда включены.
FIX        (keep)
WHY        OK
```

---

## 12 · Footer

All current footer strings read correctly. No changes proposed.

---

## 13 · Auth flows

```
KEY        auth.sign_up_check_inbox_body
NOW        Мы отправили ссылку подтверждения на {email}. Нажмите на неё, чтобы завершить регистрацию.
FIX        (keep)
WHY        natural
```

```
KEY        auth.reset_missing_session
NOW        Эта ссылка сброса истекла или уже использована. Запросите новую и попробуйте снова.
FIX        Срок действия этой ссылки сброса истёк или она уже использована. Запросите новую и попробуйте снова.
WHY        "ссылка истекла" is loose; "срок действия истёк" is the conventional Russian phrasing
```

---

## Summary

- **Section 0-A** is by far the biggest batch — 24 рутина gender fixes. Decide Path A (feminine agreement) vs Path B (switch to ритуал) before I apply.
- **Section 2** is a consistency fix — pick тест or квиз.
- Sections 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13 are small polish — accept or reject individually.

Once you've marked it up, send it back and I'll do the whole pass in one commit. Estimated apply time: 5-10 minutes once I have your edits.
