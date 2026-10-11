# Classifier accuracy report

Source: sample-001.csv

Labelled listings: 292

## deterministic
Labelled basketball singles: 249 (no row from this classifier: 0)
Gate (is it a basketball single?): precision  86.1%, recall  64.7% [tp 161, fp 26, fn 88]
Identity (player + year + productLine + cardNumber + parallel): precision  26.1% (48/184 committed), accuracy  20.9% (52/249)

| field | precision | recall | correct | predicted | truth |
|---|---|---|---|---|---|
| player |  34.0% |  27.4% | 68 | 200 | 248 |
| year | 100.0% |  88.3% | 219 | 219 | 248 |
| productLine |  84.0% |  69.4% | 163 | 194 | 235 |
| cardNumber |  98.5% |  95.6% | 197 | 200 | 206 |
| parallel |  73.5% |  19.7% | 25 | 34 | 127 |
| serialLimit | 100.0% |  91.8% | 67 | 67 | 73 |
| isRookie |  97.5% |  91.7% | 77 | 79 | 84 |
| isAuto |  87.5% |  63.6% | 14 | 16 | 22 |

## jev
Labelled basketball singles: 249 (no row from this classifier: 0)
Gate (is it a basketball single?): precision 100.0%, recall  98.4% [tp 245, fp 0, fn 4]
Identity (player + year + productLine + cardNumber + parallel): precision  86.2% (81/94 committed), accuracy  39.0% (97/249)

| field | precision | recall | correct | predicted | truth |
|---|---|---|---|---|---|
| player |  98.8% |  97.2% | 241 | 244 | 248 |
| year | 100.0% |  98.0% | 243 | 243 | 248 |
| productLine | 100.0% |  43.8% | 103 | 103 | 235 |
| cardNumber |  98.5% |  96.6% | 199 | 202 | 206 |
| parallel | 100.0% |  29.9% | 38 | 38 | 127 |
| serialLimit | 100.0% | 100.0% | 73 | 73 | 73 |
| isRookie |  97.6% |  98.8% | 83 | 85 | 84 |
| isAuto |  86.4% |  86.4% | 19 | 22 | 22 |

