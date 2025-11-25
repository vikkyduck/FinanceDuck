# Безопасность приложения

## Защита от XSS (Cross-Site Scripting)

### Реализованные меры защиты

#### 1. Санитизация пользовательского ввода
Все пользовательские данные санитизируются перед сохранением в базу данных через утилиты из `src/lib/sanitize.ts`:

- **sanitizeText()** - удаляет HTML-теги и экранирует спецсимволы
- **sanitizeEmail()** - валидирует и очищает email адреса
- **sanitizePhone()** - валидирует и очищает номера телефонов
- **sanitizeFileName()** - удаляет опасные символы из имен файлов
- **sanitizeNumber()** - валидирует числовые значения
- **sanitizeDate()** - валидирует даты
- **isValidUuid()** - проверяет корректность UUID

#### 2. Автоматическое экранирование в React
React автоматически экранирует весь текст, выводимый в JSX, что предотвращает большинство XSS-атак.

```tsx
// ✅ Безопасно - React автоматически экранирует
<div>{userName}</div>

// ❌ НИКОГДА не используйте
<div dangerouslySetInnerHTML={{__html: userInput}} />
```

#### 3. Валидация загружаемых файлов
- Максимальный размер: 10MB
- Разрешенные типы: PDF, Word, Excel, PNG, JPG/JPEG
- Санитизация имен файлов

#### 4. Валидация UUID
Все идентификаторы проверяются на корректность перед использованием в запросах.

### Где применяется санитизация

#### CreateInvoiceDialog
- Номер счета
- Примечания
- UUID партнера и клиента
- Сумма счета
- Комиссия партнера

#### ManageClientsDialog
- Название клиента
- Email
- Телефон
- UUID партнера

#### ManagePartnersDialog
- Название партнера
- Email
- Телефон

#### AddExpenseDialog
- Описание расхода
- Сумма
- Дата
- UUID счета

#### UploadDocumentDialog
- Имя файла
- Примечания
- Тип документа
- Валидация типа и размера файла

## Rate Limiting

Все формы защищены от спама:
- **Формы**: 5 отправок в минуту
- **Блокировка**: 3 минуты при превышении лимита
- **API запросы**: 60 запросов в минуту

## Обработка ошибок

Централизованная обработка через `src/lib/errorHandler.ts`:
- Понятные сообщения для пользователей
- Логирование для отладки
- Никакая чувствительная информация не показывается пользователю

## Session Token Validation

Все SECURITY DEFINER функции управления (партнёры, клиенты) защищены валидацией токена сессии:
- Параметр `_token_id` должен совпадать с токеном в контексте сессии
- Попытки использовать чужой токен блокируются и логируются
- Отсутствие контекста сессии также логируется как подозрительная активность

### События безопасности для валидации токенов

**missing_session_context** (HIGH severity):
- Когда вызов функции выполняется без установленного контекста сессии
- Указывает на неправильную настройку клиента или попытку обхода

**token_mismatch_attack** (CRITICAL severity):
- Когда токен в параметре не совпадает с токеном в сессии
- Явная попытка использовать чужие права доступа
- Требует немедленного расследования

### Защищенные функции

Валидация токена применена к:
- `manage_partners_list` - список партнёров
- `manage_partners_add` - добавление партнёра
- `manage_partners_delete` - удаление партнёра
- `manage_clients_list` - список клиентов
- `manage_clients_add` - добавление клиента
- `manage_clients_delete` - удаление клиента

## Row Level Security (RLS)

База данных защищена политиками RLS:
- Админы видят всё
- Ассистенты видят всё, но не могут удалять некоторые данные
- Партнеры видят только свои данные
- Клиенты видят только свои счета

## Рекомендации для разработчиков

### ✅ Всегда делайте

1. **Устанавливайте контекст сессии перед RPC вызовами**
   ```typescript
   import { supabase } from '@/integrations/supabase/client';
   
   // Установить контекст сессии
   const session = getSession(); // из localStorage
   await supabase.rpc('set_session_context', { _token_id: session.token_id });
   
   // Теперь можно вызывать функции управления
   await supabase.rpc('manage_clients_add', {
     _token_id: session.token_id,
     _name: 'Client Name'
   });
   ```

2. **Санитизируйте все пользовательские данные**
   ```typescript
   import { sanitizeText, sanitizeEmail } from '@/lib/sanitize';
   
   const cleanName = sanitizeText(userInput);
   const cleanEmail = sanitizeEmail(emailInput);
   ```

3. **Валидируйте UUID перед использованием**
   ```typescript
   import { isValidUuid } from '@/lib/sanitize';
   
   if (!isValidUuid(userId)) {
     throw new Error('Invalid ID');
   }
   ```

4. **Используйте централизованную обработку ошибок**
   ```typescript
   import { handleSupabaseError, showSuccess } from '@/lib/errorHandler';
   
   const { data, error } = await supabase.from('table').insert(data);
   if (error) {
     handleSupabaseError(error, { operation: 'insert_data' });
   } else {
     showSuccess('Успешно', 'Данные сохранены');
   }
   ```

5. **Проверяйте rate limits в формах**
   ```typescript
   import { useRateLimit } from '@/hooks/useRateLimit';
   
   const { checkLimit } = useRateLimit('form');
   
   const handleSubmit = async () => {
     const limitCheck = checkLimit();
     if (!limitCheck.allowed) return;
     // ... остальной код
   };
   ```

### ❌ Никогда не делайте

1. **Не вызывайте RPC функции без установки контекста сессии**
2. **Не передавайте токен другого пользователя в параметрах функций**
3. **Не используйте dangerouslySetInnerHTML с пользовательскими данными**
4. **Не доверяйте данным из localStorage без валидации**
5. **Не выводите детали ошибок SQL пользователю**
6. **Не храните чувствительные данные в localStorage**
7. **Не используйте eval() или Function() с пользовательскими данными**

## Мониторинг безопасности

### Регулярно проверяйте

1. **События безопасности с критической важностью**
   - `token_mismatch_attack` - попытки использовать чужой токен
   - `missing_session_context` - вызовы без контекста сессии
2. Логи попыток превышения rate limits
3. Ошибки валидации (могут указывать на атаки)
4. Необычную активность в RLS политиках
5. Размеры загружаемых файлов

### Инструменты

- Supabase Dashboard → Logs для просмотра ошибок
- Browser DevTools Console для отладки
- Network tab для проверки запросов

## Обновления безопасности

Регулярно обновляйте зависимости:
```bash
npm audit
npm audit fix
```

## Контакты

При обнаружении уязвимостей безопасности:
1. Не создавайте публичные issue
2. Свяжитесь с командой напрямую
3. Опишите уязвимость и шаги воспроизведения
