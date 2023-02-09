
const vscode    = require('vscode');
const owl       = require("./owl.js");

const heroes            = owl.heroes;
const actions           = owl.actions;
const keywordObj           = owl.keywordObj;
const constants             = owl.constants;
const compItemList      = owl.compItemList;
const hoverInfo         = owl.hoverInfo;
const sigHelpInfo       = owl.sigHelpInfo;

const brackets_Left     = ["(", "[", "{"];
const brackets_right    = [")", "]", "}"];
const quotes            = ["\"", "'", "`"];

function activate(context) {
    vscode.window.showInformationMessage('owl插件已激活!');

    //---------------------------------------- 悬停信息 ----------------------------------------
    vscode.languages.registerHoverProvider('owl', {
        provideHover(document, position, token) {
            let keyword = document.getText(document.getWordRangeAtPosition(position));
            if (keyword in hoverInfo) {
                pp("Hover: " + keyword);
                let string = hoverInfo[keyword];
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

            //------------- 步骤1：检测关键词位置和参数索引 -------------
            let isInString = false;//用于判断是否检测到了字符串
            let currentQuote = "";//用于储存字符串的引号类型
            let currentArgIndex = 0;//当前函数的参数索引
            let nestLayers = 0;//函数的嵌套层数

            let i = -1;
            for (; i >= -position.character + 1; i--) {//检测光标所在位置的函数名和参数索引
                //pp(document.getText(new vscode.Range(position.translate(0, i+1), position.translate(0, i)))); //获取索引位置的字符
                //pp(document.getText(new vscode.Range(position.translate(0, i), position.translate(0, i-1)))); //获取索引位置前一位的字符
                let currentChar = document.getText(new vscode.Range(position.translate(0, i+1), position.translate(0, i)));//向左逐个获取字符(包括刚刚输入的字符)
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
                    if (currentChar == currentQuote && (i == 0 || document.getText(new vscode.Range(position.translate(0, i), position.translate(0, i-1))) != "\\")) {
                        //pp("退出字符串模式：" + currentChar + " " + i);
                        isInString = false;
                    }
                }
            }

            //------------- 步骤2：检测 -------------
            if (isInString) {
                pp("正在输入字符串");
                return;
            }
            let range = document.getWordRangeAtPosition(position.translate(0, i));
            if (range == undefined) {
                pp("没有检测到关键词");
                return;
            }
            let funcName = document.getText(range);
            let funcKeywordList = Object.keys(keywordObj);
            if (funcKeywordList.indexOf(funcName) == -1) {
                pp("列表中没有匹配的关键词：" + funcName);
                return;
            }
            let funcObj = keywordObj[funcName];
            if (funcObj.参数.length == 0) {
                pp("这个动作不需要参数");
                return;
            }

            //------------- 步骤3：根据关键词返回信息 -------------
            pp("func: " + funcName + ", arg index: " + currentArgIndex);
            let sigHelp = sigHelpInfo[funcName];
            sigHelp.activeParameter = currentArgIndex;
            return sigHelp;

        }
    }, ',', '(', ')');

    //---------------------------------------- 代码补全 ----------------------------------------
    vscode.languages.registerCompletionItemProvider("owl", {
        provideCompletionItems(document, position, token, context) {
            
            return compItemList;
        }
    });

}

function deactivate() { }

function pp(string) {//Debug
    console.log(string);
}


module.exports = {
    activate,
    deactivate
}

