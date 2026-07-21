import { Button, Card, Result as AntdResult } from 'antd';
import { useNavigate } from 'react-router-dom';

export default function ResultPage() {
  const nav = useNavigate();

  return (
    <Card className="textbook-card">
      <AntdResult
        status="success"
        title="本局完成"
        subTitle="本次闯关结果已经保存，可以返回副本列表继续挑战。"
        extra={[
          <Button key="back" type="primary" onClick={() => nav('/rogue')}>返回闯关副本</Button>,
        ]}
      />
    </Card>
  );
}
