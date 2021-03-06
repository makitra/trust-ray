import { Request, Response } from "express";
import { sendJSONresponse } from "../common/Utils";
import * as winston from "winston";
import * as axios from "axios"
import { Promise } from "bluebird";

const CoinMarketCap = require("coinmarketcap-api");

export class PriceController {
    private client = new CoinMarketCap();
    private refreshLimit = 600;
    private lastUpdated: any = {};
    private latestPrices: any = {};
    private isUpdating: any = {};
    private coinmarketcapImageURL = "https://files.coinmarketcap.com/static/img/coins/128x128/";

    getPrices = (req: Request, res: Response) => {
        const currency = req.query.currency || "USD";
        const symbols = (req.query.symbols || "").split(",");

        this.getRemotePrices(currency).then((prices: any) => {
            sendJSONresponse(res, 200, {
                status: true,
                response: this.filterPrices(prices, symbols, currency),
            })
        }).catch((error: Error) => {
            sendJSONresponse(res, 500, {
                status: 500,
                error,
            });
        });
    }

    getTokenPrices = (req: Request, res: Response) => {
        const currency = req.body.currency || "USD";
        const symbols = req.body.tokens.map((item: any) => item.symbol);

        this.getRemotePrices(currency).then((prices: any) => {
            sendJSONresponse(res, 200, {
                status: true,
                response: this.filterTokenPrices(prices, req.body.tokens, currency),
            })
        }).catch((error: Error) => {
            sendJSONresponse(res, 500, {
                status: 500,
                error,
            });
        });
    }

    private filterTokenPrices(prices: any[], tokens: any[], currency: string): any {
        const result = prices.reduce(function(map, obj) {
            map[obj.id] = obj;
            return map;
        }, {});

        const foundValues: any[] = [];
        // Exclude duplicates, map contracts to symbols
        prices.forEach(price => {
            tokens.forEach((token) => {
                if (price.symbol === token.symbol) {
                    foundValues.push({price, token});
                }
            })
        })

        return foundValues.map((obj) => {
            const priceKey = "price_" + currency.toLowerCase();
            return {
                id: obj.price.id,
                name: obj.price.name,
                symbol: obj.price.symbol,
                price: obj.price[priceKey],
                percent_change_24h: obj.price.percent_change_24h || "0",
                contract: obj.token.contract,
                image: this.imageForPrice(obj.price),
            }
        })
    }

    private filterPrices(prices: any[], symbols: string[], currency: string): any {
        // Improve. Exclude duplicate symbols. order by market cap.

        const ignoredSymbols = new Set<string>(["CAT"]);
        const foundSymbols = new Set<any>();
        const foundPrices: any[] = [];
        prices.forEach(price => {
            const priceSymbol = price.symbol;

            if (ignoredSymbols.has(priceSymbol)) return;

            if (priceSymbol === symbols.find(x => x === priceSymbol) && !foundSymbols.has(priceSymbol)) {
                foundPrices.push(price);
                foundSymbols.add(priceSymbol);
            }
        })
        return foundPrices.map((price) => {
            const priceKey = "price_" + currency.toLowerCase();
            return {
                id: price.id,
                name: price.name,
                symbol: price.symbol,
                price: price[priceKey],
                percent_change_24h: price.percent_change_24h || "0",
                image: this.imageForPrice(price),
            }
        })
    }

    private getRemotePrices(currency: string) {
        return new Promise((resolve, reject) => {
            const now = Date.now();
            const lastUpdatedTime = this.lastUpdated[currency] || 0;
            const difference = (now - lastUpdatedTime) / 1000;

            const isUpdating = this.isUpdating[currency] || false;
            if ((this.lastUpdated === 0 || difference >= this.refreshLimit) && !isUpdating) {
                this.isUpdating[currency] = true;
                this.getCoinMarketCapPrices(currency).timeout(3000).then((prices: any) => {
                    this.lastUpdated[currency] = now;
                    this.latestPrices[currency] = prices;
                    this.isUpdating[currency] = false
                    resolve(this.latestPrices[currency]);
                }).catch((error: Error) => {
                    this.isUpdating[currency] = false
                    resolve(this.latestPrices[currency] || []);
                    winston.error(`getRemotePrices `, error);
                });
            } else {
                resolve(this.latestPrices[currency]);
            }
        })
    }

    private imageForPrice(token: {id: string}) {
        return this.coinmarketcapImageURL + token.id + ".png";
    }

    private getCoinMarketCapPrices(currency: string) {
        return new Promise((resolve, reject) => {
            this.client.getTicker({limit: 0, convert: currency}).then((prices: any) => {
                resolve(prices);
            });
        });
    }
}
