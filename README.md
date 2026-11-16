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

## Relatório totalizado do Forponto

O app lê direto o relatório **"Totalizado por Funcionário"** do Forponto (`.xlsx`), sem editar a planilha. Ele procura o cabeçalho `Funcionários` e as colunas `Faltas`, `AD. NOT.`, `H.E.100%`, `H.E.50%`, `H. NEG.` e `COMP. DIA`, e lê o período na linha `Período dd/mm/aaaa a dd/mm/aaaa`. O mês de fechamento é escolhido sozinho a partir da data final do período.

- Saldo = `H.E.50%` menos `H. NEG.`. `H.E.100%` e adicional noturno aparecem só para conferência.
- Se a última coluna do relatório (saldo de H.E. 50%) divergir dessa conta, o app avisa.
- Se houver mais de um funcionário no relatório, usa o primeiro e avisa.

Para rodar os testes do leitor: `npm test`.

## Formatos aceitos

- `.xlsx` (lido com ExcelJS) e `.xls` (lido com SheetJS). O leitor é escolhido pelo conteúdo do arquivo, não pela extensão, então também funciona com HTML exportado como `.xls`.
- SheetJS vem do CDN oficial (`cdn.sheetjs.com`), pois a versão do npm está desatualizada e com falhas de segurança conhecidas.

## Regra das horas extras

Com o saldo de horas negativo, não é permitido fazer mais de 1h extra por dia. O app mostra um aviso quando o saldo está negativo e, com batidas diárias, marca e lista os dias em que o extra passou de 1h com o saldo acumulado negativo até o dia anterior. No relatório totalizado do Forponto não há dados por dia, então só aparece o aviso geral.

## Planilha de batidas diárias

Use o botão **Baixar modelo Excel** para gerar uma planilha do ciclo selecionado. Preencha uma linha por dia com as colunas:

| Coluna | Conteúdo |
| --- | --- |
| Data | Data do registro |
| Entrada | Horário inicial |
| Início intervalo | Saída para intervalo |
| Fim intervalo | Retorno do intervalo |
| Saída | Horário final |
| Situação | `Trabalhado`, `Folga`, `Feriado`, `Férias` ou `Afastamento` |

O importador lê arquivos `.xlsx` e `.xls` e reconhece cabeçalhos equivalentes em português e inglês. Registros ficam salvos no `localStorage` do navegador.
