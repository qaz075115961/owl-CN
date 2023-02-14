
const vscode    = require('vscode');
const owl       = require("./owl.js");

const heroes            = owl.heroes;
const actions           = owl.actions;
const keywordObj           = owl.keywordObj;
const constantsKeywordObj           = owl.constantsKeywordObj;
const constants             = owl.constants;
const format             = owl.format;
var compItemList      = owl.compItemList;
const constCompItemList      = owl.constCompItemList;
const hoverInfo         = owl.hoverInfo;
const sigHelpInfo       = owl.sigHelpInfo;


const brackets_Left     = ["(", "[", "{"];
const brackets_right    = [")", "]", "}"];
const quotes            = ["\"", "'", "`"];
const specialKeyword    = ["持续", "全局", "每名玩家", "-"]

var rulesCount = 0;

function detectKeyword(doc, pos) {
    let isInString = false;//用于判断是否检测到了字符串
    let currentQuote = "";//用于储存字符串的引号类型
    let currentArgIndex = 0;//当前函数的参数索引
    let nestLayers = 0;//函数的嵌套层数

    let i = -1;
    for (; i >= -pos.character + 1; i--) {//检测光标所在位置的函数名和参数索引
        let currentChar = doc.getText(new vscode.Range(pos.translate(0, i+1), pos.translate(0, i)));//向左逐个获取字符(包括刚刚输入的字符)
        if (!isInString) {
            if (quotes.indexOf(currentChar) != -1) {//遇到引号时，转变为字符串模式
                //pp("进入字符串模式：" + currentChar + " " + i);
                isInString = true;
                currentQuote = currentChar;
            }
            else if (nestLayers == 0 && currentChar == ",") {//遇到逗号且嵌套层数为0时，当前参数索引增加
                currentArgIndex++;
            }
            else if (brackets_right.indexOf(currentChar) != -1) {//遇到右括号时，增加嵌套层数
                nestLayers++;
            }
            else if (brackets_Left.indexOf(currentChar) != -1) {//遇到左括号时，减少嵌套层数
                nestLayers--;
                if (nestLayers < 0 && currentChar == "(") {//当遇到左括号且嵌套层数小于0时，立即停止循环
                    //pp("检测到“(”立刻退出循环");
                    break;
                }
            }
        }
        else {//当前字符串与记录的引号相同，且当前字符串的前一个字符不是反斜杠，或i为0时，退出字符串模式
            if (currentChar == currentQuote && (i == 0 || doc.getText(new vscode.Range(pos.translate(0, i), pos.translate(0, i-1))) != "\\")) {
                //pp("退出字符串模式：" + currentChar + " " + i);
                isInString = false;
            }
        }
    }

    //------------- 步骤2：检测 -------------
    if (isInString) {
        let err = "正在输入字符串";
        return err;
    }
    let range = doc.getWordRangeAtPosition(pos.translate(0, i));
    if (range == undefined) {
        let err = "没有检测到关键词";
        return err;
    }
    let funcName = doc.getText(range);
    let funcKeywordList = Object.keys(keywordObj);
    if (funcKeywordList.indexOf(funcName) == -1) {
        let err = "列表中没有匹配的关键词：" + funcName;
        return err;
    }
    let funcObj = keywordObj[funcName];
    if (funcObj.参数.length == 0) {
        let err = "这个动作不需要参数";
        return err;
    }

    return [funcName, currentArgIndex];
}

function argRemind(doc, pos) {
    let result = detectKeyword(doc, pos);
    if (typeof result == "string") {
        pp("代码补全：" + result);
        return;
    }

    let funcName = result[0];
    let currentArgIndex = result[1];

    if (!funcName in keywordObj) {
        pp("列表中找不到" + funcName);
        return;
    }

    let funcObj = keywordObj[funcName];
    if (funcObj.参数.length == 0) {
        pp(funcName + "不需要参数");
        return;
    }

    let arg = funcObj.参数[currentArgIndex];
    if ("类型" in arg == false || arg.类型 == null || arg.类型 == "0000000") {
        pp(funcName + "的参数" + currentArgIndex + "没有可选项");
        return;
    }

    let argType = arg.类型;
    let newList = constCompItemList.filter(item => Object.keys(constants[argType]).indexOf(item.label) != -1);
    return newList;
}

function builConstKeywordInfo(doc, pos, keyword) {
    let result = detectKeyword(doc, pos);
    let constKeywordInfo = "";
    if (typeof result == "object") {
        let funcName = result[0];
        let currentArgIndex = result[1];
        let type = keywordObj[funcName].参数[currentArgIndex].类型;
        if (type == "0000000") {
            pp("悬停信息：类型为占位符");
            return "";
        }
        let otherOptionObj = constants[type];
        let otherOptionList = Object.keys(otherOptionObj);
        constKeywordInfo = "此处还可以选择：\n\n";
        for (let i = 0; i < otherOptionList.length; i++) {
            if (otherOptionList[i] != keyword) {
                constKeywordInfo += "`" + otherOptionList[i] + "`";
                let description = otherOptionObj[otherOptionList[i]];
                if (description != "") {
                    constKeywordInfo += ": " + otherOptionObj[otherOptionList[i]];
                }
                constKeywordInfo += "\n\n";
            }
        }
    }
    pp("悬停信息：" + result);
    return constKeywordInfo;
}

function searchRuleName(str) {
    let name = "⚠️未命名规则";
    if (str.search(/规则\("[\W\w]*"\)/g) == -1) {
        name = "⚠️无效的规则名";
        return name;
    }
    let array = [];
    for (let i = 0; i < str.length; i++) {
        if (str.slice(i, i+1) == '"') {
            array.push(i);
        }
    }
    let startPos = array[0] + 1;
    let endPos = array[array.length - 1];
    if (endPos > startPos) {
        name = str.slice(startPos, endPos);
    }
    return name;
}

function searchEventType(document, lineIndex, forLimit) {
    let type = "⚠️找不到事件类型，或空行太多";
    let i = lineIndex;
    for (; i < lineIndex + forLimit; i++) {
        if (document.lineAt(i).text.indexOf(";") != -1) {
            break;
        }
    }
    let str = document.lineAt(i).text;

    let j = 0;
    for (; j < str.length; j++) {
        if (str.slice(j, j+1) != "\t") {
            break;
        }
    }
    str = str.slice(j, str.length - 1);
    if (str in constants.事件 == false) {
        type = "⚠️无效的事件类型";
        return type;
    }
    if (str.length > 0) {
        type = str;
    }
    return type;
}

function buildFormatCompItem(obj) {
    let list = [];
    let keyList = Object.keys(obj);
    pp(rulesCount)
    for (let i = 0; i < keyList.length; i++) {
        let keyName = keyList[i];
        let text = obj[keyName].replace("%1$s", rulesCount + 1);

        let item = new vscode.CompletionItem();
        item.label = keyName + "(格式化)";
        item.insertText = text;
        item.filterText = owl.addSpaceBetweenChar(keyName) + owl.buildPinyinInfo(keyName);
        item.documentation = new vscode.MarkdownString("```owl\n" + text + "\n```");
        item.kind = vscode.CompletionItemKind.Class;
        list.push(item);
    }
    return list;
}

function searchCompleteKeyword(doc, pos) {
    let keyword = "🍀";
    for (let i = 0; i < 9; i++) {
        let char = doc.getText(new vscode.Range(pos.translate(0, i), pos.translate(0, i+1)));
        if ("全局".indexOf(char) != -1) {
            keyword = "持续 - 全局";
            break;
        }
        else if ("每名玩家".indexOf(char) != -1) {
            keyword = "持续 - 每名玩家";
            break;
        }
    }
    return keyword;
}

function activate(context) {
    vscode.window.showInformationMessage('owl插件已激活!');

    //---------------------------------------- 悬停信息 ----------------------------------------
    vscode.languages.registerHoverProvider('owl', {
        provideHover(document, position, token) {
            let constKeywordInfo = "";
            let keyword = document.getText(document.getWordRangeAtPosition(position));
            if (specialKeyword.indexOf(keyword) != -1) {
                keyword = searchCompleteKeyword(document, position);
            }

            if (keyword in constantsKeywordObj) {
                pp(keyword)
                constKeywordInfo = builConstKeywordInfo(document, position, keyword);
            }

            if (keyword in hoverInfo) {
                pp("Hover: " + keyword);
                let string = hoverInfo[keyword] + constKeywordInfo;
                return new vscode.Hover(string);
            }
        }
    });

    //---------------------------------------- 参数指引 ----------------------------------------
    vscode.languages.registerSignatureHelpProvider('owl', {
        provideSignatureHelp(document, position, token, context) {
            //结束指引
            if (context.triggerCharacter === ')') {
                return;
            }

            let result = detectKeyword(document, position);
            if (typeof result == "string") {
                pp("参数指引：" + result);
                return;
            }

            let funcName = result[0];
            let currentArgIndex = result[1];

            let sigHelp = sigHelpInfo[funcName];
            sigHelp.activeParameter = currentArgIndex;
            pp("func: " + funcName + ", arg index: " + currentArgIndex);
            return sigHelp;

        }

    }, ',', '(', ')');

    //---------------------------------------- 代码补全 ----------------------------------------
    vscode.languages.registerCompletionItemProvider("owl", {
        provideCompletionItems(document, position, token, context) {
            if (context.triggerCharacter == ',' || context.triggerCharacter == '(') {
                let newList = argRemind(document, position);
                return newList;
            }

            let formatCompItemList = buildFormatCompItem(format);
            let list = compItemList.concat(formatCompItemList)
            return list;
        }
        
    }, ',', '(');

    //---------------------------------------- 规则大纲 ----------------------------------------
    vscode.languages.registerDocumentSymbolProvider("owl", {
        provideDocumentSymbols(document, token) {
            return new Promise((resolve, reject) => {
                let symbolList = [];
                let foldList = [symbolList];
                let fold = true;
                let count = 0;
                
                for (let i = 0; i < document.lineCount; i++) {
                    let line = document.lineAt(i);
                    
                    if (line.text.startsWith("规则")) {
                        let symbol = new vscode.DocumentSymbol(
                            searchRuleName(line.text),
                            searchEventType(document, i, 5),
                            vscode.SymbolKind.Interface,
                            line.range,
                            line.range
                        );
                        // symbolList.push(symbol);

                        foldList[foldList.length-1].push(symbol)
                        if (fold) {
                            foldList.push(symbol.children);
                            fold = false;
                        }
                        count += 1;
                    }

                    else if (line.text.startsWith("禁用 规则")) {
                        let symbol = new vscode.DocumentSymbol(
                            "❌ " + searchRuleName(line.text),
                            searchEventType(document, i, 5),
                            vscode.SymbolKind.Interface,
                            line.range,
                            line.range
                        );
                        // symbolList.push(symbol);

                        foldList[foldList.length-1].push(symbol)
                        if (fold) {
                            foldList.push(symbol.children);
                            fold = false;
                        }
                        count += 1;
                    }

                    else if (line.text.startsWith("}")) { 
                        if (!fold) {
                            foldList.pop();
                            fold = true;
                        }
                    }
/* 

                    else if (line.text.startsWith("	事件")) {
                        let symbol = new vscode.DocumentSymbol(
                            searchEventType(document, i, 3),
                            "",
                            vscode.SymbolKind.Enum,
                            line.range,
                            line.range
                        );
                        // symbolList.push(symbol);

                        foldList[foldList.length-1].push(symbol)
                        if (fold) {
                            foldList.push(symbol.children);
                            fold = false;
                        }
                    } 
 */
                }
                rulesCount = count;
                resolve(symbolList);
            });
        }
    })


}

function deactivate() { }

function pp(string) {//Debug
    console.log(string);
}


module.exports = {
    activate,
    deactivate
}

