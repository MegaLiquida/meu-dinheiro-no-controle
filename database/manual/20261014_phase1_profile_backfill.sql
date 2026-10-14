-- Meu Dinheiro no Controle
-- Fase 1: provisionamento de perfis financeiros ausentes
-- Aplicação manual: execute no DBeaver, após confirmar a conexão correta.
-- Este script não contém credenciais e não deve ser executado automaticamente pela aplicação.

BEGIN;

-- Verificação de segurança: interrompe em outro banco.
DO $$
BEGIN
  IF current_database() <> 'data_base_meu_dinheiro' THEN
    RAISE EXCEPTION 'Banco incorreto: esperado data_base_meu_dinheiro, encontrado %', current_database();
  END IF;

  IF to_regclass('public.users') IS NULL OR to_regclass('public.user_profiles') IS NULL THEN
    RAISE EXCEPTION 'As tabelas users e user_profiles precisam existir antes da aplicação.';
  END IF;
END
$$;

-- Diagnóstico antes da alteração.
SELECT
  current_database() AS database_name,
  current_user AS database_user,
  COUNT(*) FILTER (WHERE p.user_id IS NULL) AS users_without_profile,
  COUNT(*) AS total_users
FROM users u
LEFT JOIN user_profiles p ON p.user_id = u.id;

-- Cria somente perfis ausentes. Não altera perfis existentes.
WITH inserted AS (
  INSERT INTO user_profiles (user_id)
  SELECT u.id
  FROM users u
  LEFT JOIN user_profiles p ON p.user_id = u.id
  WHERE p.user_id IS NULL
  ON CONFLICT (user_id) DO NOTHING
  RETURNING user_id
)
SELECT COUNT(*) AS profiles_created FROM inserted;

-- Diagnóstico depois da alteração.
SELECT
  COUNT(*) FILTER (WHERE p.user_id IS NULL) AS users_without_profile_after,
  COUNT(*) AS total_users
FROM users u
LEFT JOIN user_profiles p ON p.user_id = u.id;

COMMIT;

-- Resultado esperado: users_without_profile_after = 0.
-- Se a execução for interrompida antes do COMMIT, faça ROLLBACK no DBeaver.
