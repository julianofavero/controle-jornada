# Ritmo | Controle de jornada

Aplicação web para acompanhar horas extras e déficits dentro do ciclo de fechamento da folha.

## Executar localmente

```bash
npm install
npm run dev
```

Para gerar a versão de produção:

```bash
npm run build
```

O build gera um único arquivo, `dist/index.html`, com tudo embutido. Dá para abrir com duplo clique, sem servidor. No Windows, o `abrir.bat` instala as dependências, gera o build se faltar e abre o app.

> Não abra o `index.html` da raiz com duplo clique: ele é o arquivo-fonte e só funciona pelo `npm run dev`. Abra o `dist/index.html`.

## Regras atuais

- O ciclo selecionado vai do dia 16 do mês anterior ao dia 15 do mês selecionado.
- A jornada prevista é de 8h48 por dia, de segunda a sexta, com intervalo informado nas batidas.
- O saldo é calculado como horas acima da jornada menos horas abaixo.
- A meta é fechar o ciclo com saldo de -5 minutos ou menor.
- Horas excedentes ficam visíveis para compensação; o resumo também mostra déficits e saldo líquido.

## Planilha

Use o botão **Baixar modelo Excel** para gerar uma planilha do ciclo selecionado. Preencha uma linha por dia com as colunas:

| Coluna | Conteúdo |
| --- | --- |
| Data | Data do registro |
| Entrada | Horário inicial |
| Início intervalo | Saída para intervalo |
| Fim intervalo | Retorno do intervalo |
| Saída | Horário final |
| Situação | `Trabalhado`, `Folga`, `Feriado`, `Férias` ou `Afastamento` |

O importador lê arquivos `.xlsx` e reconhece cabeçalhos equivalentes em português e inglês. Registros ficam salvos no `localStorage` do navegador.
