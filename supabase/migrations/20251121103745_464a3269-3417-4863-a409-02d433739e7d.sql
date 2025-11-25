-- Создаем функцию для автоматического удаления деактивированных токенов
CREATE OR REPLACE FUNCTION public.auto_delete_deactivated_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Если токен деактивирован, удаляем его
  IF NEW.is_active = false AND OLD.is_active = true THEN
    DELETE FROM access_tokens WHERE id = NEW.id;
    RETURN NULL; -- Возвращаем NULL, так как запись уже удалена
  END IF;
  RETURN NEW;
END;
$$;

-- Создаем триггер на таблице access_tokens
CREATE TRIGGER trigger_auto_delete_deactivated_token
  AFTER UPDATE ON access_tokens
  FOR EACH ROW
  EXECUTE FUNCTION auto_delete_deactivated_token();