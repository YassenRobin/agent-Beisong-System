import { useEffect, useState } from 'react';
import { Card, Result as AntdResult, Button } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';

export default function ResultPage() {
  const { runId } = useParams();
  const nav = useNavigate();
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    setInfo({ id: runId });
  }, [runId]);

  return (
    <Card className="textbook-card">
      <AntdResult
        status="success"
        title="本局完成"
        subTitle={`Run ID: ${runId}`}
        extra={[
          <Button key="back" type="primary" onClick={() => nav('/rogue')}>返回 Rogue</Button>,
        ]}
      />
    </Card>
  );
}