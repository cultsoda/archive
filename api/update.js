// Vercel Serverless Function
// 이 코드는 Node.js 환경에서 실행됩니다.
// 먼저 터미널에서 `npm install @octokit/rest` 를 실행하여 octokit을 설치해야 합니다.
// (Vercel은 package.json을 보고 자동으로 설치해줍니다.)

const { Octokit } = require("@octokit/rest");

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'POST 메서드만 허용됩니다.' });
    }

    const { GITHUB_TOKEN, GITHUB_REPO, GITHUB_OWNER, TARGET_FILE_PATH } = process.env;

    if (!GITHUB_TOKEN || !GITHUB_REPO || !GITHUB_OWNER || !TARGET_FILE_PATH) {
        return response.status(500).json({ message: '서버 환경 변수가 설정되지 않았습니다.' });
    }

    const octokit = new Octokit({ auth: GITHUB_TOKEN });
    const { documents: newDocuments } = request.body;

    if (!newDocuments) {
        return response.status(400).json({ message: '업데이트할 문서 데이터가 없습니다.' });
    }

    try {
        // 1. 현재 파일(index.html)의 SHA 값을 가져옵니다.
        const { data: fileData } = await octokit.repos.getContent({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: TARGET_FILE_PATH,
        });

        // 2. 현재 파일 내용을 가져옵니다.
        const currentContent = Buffer.from(fileData.content, 'base64').toString('utf8');

        // 3. 파일 내용에서 문서 데이터 부분을 교체합니다.
        const DOC_DATA_START_MARKER = 'const documents = [';
        const DOC_DATA_END_MARKER = ']; // DOC_DATA_END';
        
        const startIndex = currentContent.indexOf(DOC_DATA_START_MARKER);
        const endIndex = currentContent.indexOf(DOC_DATA_END_MARKER, startIndex);

        if (startIndex === -1 || endIndex === -1) {
            throw new Error('파일에서 데이터 마커를 찾을 수 없습니다.');
        }

        const newDocsString = JSON.stringify(newDocuments, null, 4); // 예쁘게 포맷팅
        const newContent = 
            currentContent.substring(0, startIndex + DOC_DATA_START_MARKER.length) +
            `\n${newDocsString.slice(1, -1)}\n    ` + // 배열 괄호 제거 후 삽입
            currentContent.substring(endIndex);

        // 4. 새로운 내용으로 파일을 업데이트(commit)합니다.
        const commitMessage = `docs: 새로운 문서 "${newDocuments[newDocuments.length - 1].title}" 추가`;
        
        await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: TARGET_FILE_PATH,
            message: commitMessage,
            content: Buffer.from(newContent).toString('base64'),
            sha: fileData.sha,
        });

        return response.status(200).json({ message: '문서가 성공적으로 저장 및 커밋되었습니다.' });

    } catch (error) {
        console.error('GitHub API 오류:', error);
        return response.status(500).json({ message: `GitHub 처리 중 오류 발생: ${error.message}` });
    }
}
