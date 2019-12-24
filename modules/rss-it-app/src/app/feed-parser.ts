import {group} from "@angular/animations";

export interface LinkPointer {
  element: HTMLElement;
  path: string;
}

export interface ArticleRule extends PartialArticlesWithDescription {
  score: number
}

interface RawArticleRule {
  contextElementPath: string
  linkPath: string
}

export interface PartialArticlesWithStructure {
  id: string
  articles: Array<ArticleContext>;
  commonTextNodePath: Array<string>;
  notCommonTextNodePath: Array<string>;
  structureSimilarity: number,
  rule: RawArticleRule
}

export interface TitleFeatures {
  variance: number
  avgWordLength: number
}

export interface TitleRule {
  features: TitleFeatures
  textNodePath: string
}

interface DescriptionFeatures {
  variance: number
  avgWordCount: number
}

export interface DescriptionRule {
  features: DescriptionFeatures
  useCommonPaths: boolean
}

export interface Stats {
  title: TitleRule;
  description?: DescriptionRule;
}

export interface StatsWrapper {
  stats: Stats
}

export interface Article {
  title: string;
  link: string;
  description?: Array<string>;
}

export interface PartialArticlesWithTitle extends PartialArticlesWithStructure, StatsWrapper {
  linkPath: string;
  titlePath: string;
}

export interface PartialArticlesWithDescription extends PartialArticlesWithTitle {

}

export interface ArticleContext {
  linkElement: HTMLElement;
  id: string;
  // root of article
  contextElement: HTMLElement;
  // contextElementPath: string
}

export class FeedParser {
  constructor(private document: HTMLDocument) {
  }


  private getDocumentRoot(): HTMLElement {
    return this.document.getElementsByTagName('body').item(0);
  }

  private getRelativePath(node: HTMLElement, context: HTMLElement, withClassNames = false) {
    let path = node.tagName; // tagName for text nodes is undefined
    while (node.parentNode !== context) {
      node = node.parentNode as HTMLElement;
      if (typeof (path) === 'undefined') {
        path = this.getTagName(node, withClassNames);
      } else {
        path = `${this.getTagName(node, withClassNames)}>${path}`;
      }
    }
    return path;
  }

  private findLinks(): Array<HTMLElement> {
    return Array.from(this.document.getElementsByTagName('A')) as Array<HTMLElement>;
  }

  private findArticleRootElement(currentElement: HTMLElement[]): HTMLElement[] {
    while (true) {
      let parentNodes = currentElement.map(currentNode => currentNode.parentNode);
      // todo all parent nodes are the same
      if (parentNodes[0].isSameNode(parentNodes[1])) {
        break;
      }
      currentElement = parentNodes as Array<HTMLElement>;
    }
    return currentElement;
  }

  private findArticleContext(linkPointers: Array<LinkPointer>, root: HTMLElement, index: number): Array<ArticleContext> {
    const linkElements = linkPointers.map(nodeElement => nodeElement.element);
    const articleRootElements = this.findArticleRootElement(linkElements);

    const id = this.getRelativePath(articleRootElements[0], root);
    console.log(`context #${index} group ${linkPointers[0].path} gets id ${id}`);

    return linkPointers.map((linkPointer, index) => {
      const linkElement = linkPointer.element;
      const contextElement = articleRootElements[index];

      const articleContext: ArticleContext = {
        id,
        linkElement,
        contextElement,
      };
      return articleContext;
    })
  }

  private toWords(text: string): Array<string> {
    return text.trim().split(' ').filter(word => word.length > 0);
  }

  private findTextNodesInContext(context: HTMLElement): Array<HTMLElement> {
    const textNodes: Array<HTMLElement> = [];
    const walk = this.document.createTreeWalker(context, -1, null, false);
    let node;
    while ((node = walk.nextNode())) {
      if (node.cloneNode(false).textContent.trim().length > 0) {
        textNodes.push(node as HTMLElement); // fixme check
      }
    }
    return textNodes;
  }

  private findCommonTextNodes(articles: Array<ArticleContext>, root: HTMLElement, index: number): PartialArticlesWithStructure {

    const referenceArticle = articles[0];
    const referenceArticleNode = referenceArticle.contextElement;
    console.log(`common-nodes #${index} for ${referenceArticle.id}`);

    const textNodes = this.findTextNodesInContext(referenceArticleNode);

    const groupedTextNodes = textNodes
      .map(textNode => this.getRelativePath(textNode, referenceArticleNode))
      .reduce((map, pathToTextNode) => {
        // check every article contains the path
        const existsEverywhere = articles.every(article => {
          const resolvedTextNode = article.contextElement.querySelector(pathToTextNode);
          // article.commonTextNodes.push(resolvedTextNode);
          return !pathToTextNode || resolvedTextNode !== null;
        });

        if (existsEverywhere) {
          map.common.push(pathToTextNode);
        } else {
          map.notCommon.push(pathToTextNode);
        }
        return map;

      }, {common: [], notCommon: []});

    // remove paths that are children of common paths
    const notCommon = groupedTextNodes.notCommon
      .filter((notCommonPath: string) => !groupedTextNodes.common.some((commonPath: string) => notCommonPath.startsWith(commonPath)));

    return {
      id: referenceArticle.id,
      articles,
      rule: {
        linkPath: this.getRelativePath(referenceArticle.linkElement, referenceArticle.contextElement),
        contextElementPath: this.getRelativePath(referenceArticle.contextElement, root)
      },
      commonTextNodePath: groupedTextNodes.common.filter(this.onlyUnique),
      notCommonTextNodePath: notCommon,
      structureSimilarity: groupedTextNodes.common.length / textNodes.length
    };
  }

  private getTagName(node: HTMLElement, withClassNames: boolean): string {
    if (!withClassNames) {
      return node.tagName;
    }
    const classList = Array.from(node.classList)
      .filter(cn => cn.match('[0-9]+') === null);
    if (classList.length > 0) {
      return `${node.tagName}.${classList.join('.')}`;
    }
    return node.tagName;
  }

  private uniq(list: Array<string>): Array<string> {
    return list.reduce((uniqList, item) => {

      if (uniqList.indexOf(item) === -1) {
        uniqList.push(item);
      }

      return uniqList;
    }, [])
  }

  private findTitles(group: PartialArticlesWithStructure, index: number): PartialArticlesWithTitle {

    console.log(`title #${index} for #${group.id}`);

    // todo common path should use index or classes
    const sortedTitleNodes: TitleRule[] = group.commonTextNodePath.map((textNodePath) => {
      return {features: this.getTitleFeatures(group, textNodePath), textNodePath};
    })
      .filter((d) => {
        return d.features.avgWordLength > 3;
      })
      .sort((a, b) => {
        return b.features.variance - a.features.variance;
      });

    const referenceArticle = group.articles[0];

    if (sortedTitleNodes.length === 0) {
      console.log(`Drop ${group.id} - no titles found`);
      // throw new Error('No textNode found that looks like a title');
      return null;
    }

    const titlePath = sortedTitleNodes[0];
    console.log(`group ${group.id} has title ${titlePath.textNodePath}`);

    try {
      return {
        id: group.id,
        stats: {title: titlePath},
        articles: group.articles,
        rule: group.rule,
        structureSimilarity: group.structureSimilarity,
        linkPath: this.getRelativePath(referenceArticle.linkElement, referenceArticle.contextElement),
        titlePath: titlePath.textNodePath,
        commonTextNodePath: group.commonTextNodePath.filter(path => path !== titlePath.textNodePath),
        notCommonTextNodePath: group.notCommonTextNodePath
      }
    } catch (e) {
      console.error('Cannot extract title', e);
      return null;
    }
  }

  private onlyUnique(value: string, index: number, self: string[]) {
    return self.indexOf(value) === index;
  }

  private findDescriptions(group: PartialArticlesWithTitle): PartialArticlesWithDescription {
    group.stats.description = {
      features: this.getDescriptionFeatures(group),
      useCommonPaths: true
    };
    return group;
  }

  public getArticleRules(): Array<ArticleRule> {

    const body = this.getDocumentRoot();

    // find links
    const linkElements: Array<LinkPointer> = this.findLinks()
      .filter(element => this.toWords(element.textContent).length > 3)
      .map(element => {
        return {
          element,
          path: this.getRelativePath(element, body)
        };
      });

    // group links with similar path in document
    const linksGroupedByPath = linkElements.reduce((groups, linkPath) => {
      if (!groups[linkPath.path]) {
        groups[linkPath.path] = [];
      }
      groups[linkPath.path].push(linkPath);
      return groups;
    }, {} as any);


    const groups: Array<Array<LinkPointer>> = Object.values(linksGroupedByPath);

    console.log(`${groups.length} link groups`);

    const relevantGroups: Array<PartialArticlesWithDescription> = groups
      .filter((linkElements, index) => {
        const hasEnoughMembers = linkElements.length > 3;

        if (hasEnoughMembers) {
          console.log(`size #${index} keep ${linkElements[0].path} - ${linkElements.length} member`)
        } else {
          console.log(`size #${index} drop ${linkElements[0].path} - ${linkElements.length} member`)
        }

        return hasEnoughMembers;
      })
      .map((linkElements, index) => this.findArticleContext(linkElements, body, index))
      .map((articlesInGroup, index) => this.findCommonTextNodes(articlesInGroup, body, index))
      // find title: title is the first text node that has in avg 3+ words and is wrapped by the link
      .map((articlesInGroup, index) => this.findTitles(articlesInGroup, index))
      .filter(value => value)
      // find description
      .map(articlesInGroup => this.findDescriptions(articlesInGroup));


    console.log(`${relevantGroups.length} article rules`);

    return relevantGroups
      .map(group => {

        const rule = group as ArticleRule;

        rule.score = group.stats.title.features.variance * group.stats.title.features.avgWordLength +
          group.stats.description.features.variance * group.stats.description.features.avgWordCount;

        return rule;
      })
      .sort((a, b) => b.score - a.score);
  }

  public getArticles(): Array<Article> {

    const rules = this.getArticleRules();
    const bestRule = rules[0];
    return this.getArticlesByRule(bestRule);
  }

  public getArticlesByRule(rule: ArticleRule): Array<Article> {

    return Array.from(this.document.querySelectorAll(rule.rule.contextElementPath)).map(element => {
      try {
        return {
          title: element.querySelector(rule.titlePath).textContent.trim(),
          link: element.querySelector(rule.linkPath).getAttribute('href'),
          description: rule.commonTextNodePath.map(textNodePath => {
            return Array.from(element.querySelectorAll(textNodePath))
              .map(textNode => textNode.textContent.trim())
              .filter(this.onlyUnique);
          })
            .flat(1)
            .filter(text => text.length > 2)
        }
      } catch (err) {
        return undefined;
      }
    }).filter(article => article)
  }

  private getTitleFeatures(group: PartialArticlesWithStructure, textNodePath: string): TitleFeatures {
    const wordsInTitles = group.articles
      .map(article => {
        const otherTextNode = article.contextElement.querySelector(textNodePath);
        if (!otherTextNode) {
          throw new Error('Fatal! textNode does not exist');
        }
        return this.toWords(otherTextNode.textContent);
      });
    const words = wordsInTitles.flat(1);
    const variance = words.filter(this.onlyUnique).length / Math.max(words.length, 1);

    const totalWordLengthSum = wordsInTitles.map(words => words.length).reduce((sum, wordCount) => sum + wordCount, 0);
    const avgWordLength = totalWordLengthSum / wordsInTitles.length;

    return {variance, avgWordLength};
  }

  private getDescriptionFeatures(group: PartialArticlesWithTitle) {
    // todo exclude title
    const articleWords = group.articles.map(article => {
      return group.commonTextNodePath
        .map(path => Array.from(article.contextElement.querySelectorAll(path))
          .map(textNode => textNode.textContent)
        )
        .flat(1)
        .map(text => this.toWords(text))
        .flat(1);
    });

    const totalWordCount = articleWords.reduce((sum, articleWords) => {
      return sum + articleWords.length;
    }, 0);

    return {
      variance: this.uniq(articleWords.flat(1)).length / Math.max(articleWords.flat(1).length, 1),
      avgWordCount: totalWordCount / group.articles.length
    };
  }
}