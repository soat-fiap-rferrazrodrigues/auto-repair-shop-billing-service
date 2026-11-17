# auto-repair-billing-service

Microsserviço de **orçamento e pagamento** da oficina. Participa da saga
orquestrada pelo `os-service` (ver ADR-004 no repositório da API) e integra com o
**Mercado Pago (Checkout Pro)**.

## Responsabilidades
- Gerar e armazenar o orçamento da OS a partir dos itens enviados pelo os-service.
- Criar a cobrança no Mercado Pago e expor o link de pagamento.
- Receber o webhook do Mercado Pago, validar a assinatura e confirmar o status na API.
- Estornar o pagamento como compensação da saga.

## Banco de dados
PostgreSQL próprio (`budgets`, `payments`). Nenhum outro serviço acessa esse banco.
Os itens da OS chegam no comando `GenerateBudget` com os preços congelados.

## Contrato de mensageria

| Direção | Tipo | Payload |
|---|---|---|
| ⬅ comando | `billing.GenerateBudget` | `{ orderId, items[{kind, referenceId, quantity, unitPrice}], total }` |
| ⬅ comando | `billing.CreatePayment` | `{ orderId }` |
| ⬅ comando | `billing.RefundPayment` | `{ orderId, paymentId }` |
| ➡ evento | `BudgetGenerated` / `BudgetFailed` | `{ orderId, total }` / `{ orderId, reason }` |
| ➡ evento | `PaymentConfirmed` / `PaymentFailed` | `{ orderId, paymentId }` / `{ orderId, reason }` |

**Topologia SNS/SQS:**
- A fila `billing-commands` assina o tópico do os-service com o filtro `{"type":[{"prefix":"billing."}]}`.
- Os eventos vão para o tópico `billing-events`, assinado pela fila de saga do os-service.
- Toda fila tem DLQ (`maxReceiveCount=5`).

**Idempotência:** o SQS entrega cada mensagem ao menos uma vez, então todos os handlers toleram reentrega.
- O orçamento é atualizado por `orderId`.
- A preferência do Mercado Pago não é recriada se já houver uma pendente com o mesmo valor.
- O estorno usa `X-Idempotency-Key=refund-{orderId}`.
- O webhook ignora status repetidos ou já finais.

**Falhas:**
- Falha do Mercado Pago ao criar a cobrança publica `PaymentFailed`, e o orquestrador cancela a OS.
- Falha no estorno é relançada para o SQS reentregar; se persistir, a mensagem vai para a DLQ, que deve ter alarme.

## Endpoints
- `GET /payments/:orderId`: status e `checkoutUrl`.
- `POST /payments/webhook`: notificação do Mercado Pago. Exige `x-signature` válido quando `MP_WEBHOOK_SECRET` está definido.
- `GET /health`

## Executar
```bash
cp .env.example .env
docker compose up -d
npm ci && npm run migration:run:dev && npm run start:dev
```

## Qualidade
- `npm run test:cov` falha se a cobertura ficar abaixo de 80%.
- O pipeline roda lint → build → testes → SonarQube (com quality gate) → imagem → deploy.
- O deploy em homolog é automático; em produção exige aprovação manual.
- A branch `main` é protegida: exige PR e o check `Build, Test & Quality`.
